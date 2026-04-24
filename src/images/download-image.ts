/**
 * Single-URL image download primitive.
 */

import { writeFile } from "node:fs/promises"
import path from "node:path"

import { fileTypeFromBuffer } from "file-type"
import pRetry from "p-retry"

import { errorMessage, isAbortError } from "../errors"
import { toMarkdownPath } from "../fs"
import { assertPublicUrl, FetchError, isRetryableFetchError, readLimitedBytes } from "../http"
import { imageExtensionFromHeaders, isSupportedImageExtension, normalizeImageExtension } from "../parsers"

import type { RetryOptions } from "../http"
import type { Impit, ImpitResponse } from "impit"
import type { Options as PRetryOptions } from "p-retry"

/**
 * Timeout applied to each image download, in milliseconds. The timeout covers the entire
 * redirect chain rather than individual hops.
 *
 * @const {number}
 * @default
 */
const IMAGE_DOWNLOAD_TIMEOUT_MS = 10_000

/**
 * Maximum number of redirect hops to follow before throwing. Each hop is re-validated
 * through the SSRF guard so DNS rebinding and redirect-to-internal cannot be used to
 * bypass the destination allowlist.
 *
 * @const {number}
 * @default
 */
const MAX_REDIRECT_HOPS = 10

/**
 * Lower bound of HTTP redirect status codes.
 *
 * @const {number}
 * @default
 */
const HTTP_REDIRECT_MIN = 300

/**
 * Upper bound (exclusive) of HTTP redirect status codes.
 *
 * @const {number}
 * @default
 */
const HTTP_REDIRECT_MAX_EXCLUSIVE = 400

/**
 * HTTP status code for `Not Modified`, which shares the 3xx range but is not a redirect.
 *
 * @const {number}
 * @default
 */
const HTTP_NOT_MODIFIED = 304

/**
 * Contextual hooks provided by the caller for logging and cancellation.
 */
interface DownloadImageContext {
  /** Logger used to surface non-fatal download failures. */
  warn: (message: string) => void
  /** Signal used to abort the in-flight download. */
  signal: AbortSignal
  /** Retry policy applied to transient download failures. */
  retry?: RetryOptions
  /** Observer invoked after each failed attempt, before the backoff sleep. */
  onFailedAttempt?: PRetryOptions["onFailedAttempt"]
}

/**
 * Per-download options controlling file placement, naming, and the per-image size cap.
 */
interface DownloadImageOptions {
  /** Directory into which the downloaded file is written. */
  workingDirectory: string
  /** Epoch-millisecond timestamp used as the filename prefix. */
  timestamp: number
  /** Zero-based index of the image within the current batch. */
  index: number
  /** Hard upper bound on the image payload, in bytes. */
  maxBytes: number
}

/**
 * Download a single image URL and save it to the working directory.
 *
 * @param url Source URL of the image to download.
 * @param impit Shared HTTP client used for the request.
 * @param options File placement and naming options.
 * @param context Logging and cancellation hooks provided by the caller.
 * @returns The local filesystem path to the saved image, or `undefined` when the download fails or is aborted.
 */
export async function downloadImage(
  url: string,
  impit: Impit,
  options: DownloadImageOptions,
  context: DownloadImageContext
): Promise<string | undefined> {
  try {
    const response = await pRetry(async () => attemptImageFetch(url, impit, context.signal), {
      retries: 0,
      ...context.retry,
      signal: context.signal,

      /**
       * Gate retries on the `FetchError.statusCode` allowlist so non-transient failures fail fast.
       *
       * @param retryContext Retry context supplied by `p-retry`; only `error` is consulted.
       * @param retryContext.error Error thrown by the most recent attempt.
       * @returns `true` when the error is a transient fetch failure that warrants another attempt.
       */
      shouldRetry: ({ error }) => isRetryableFetchError(error),
      onFailedAttempt: context.onFailedAttempt,
    })
    const bytes = await readLimitedBytes(response, options.maxBytes, url)

    if (bytes.length === 0) {
      context.warn(`Image ${options.index} is empty: ${url}`)

      return undefined
    }

    const fileExtension = await sniffImageExtension(bytes, response.headers.get("content-type"), url)
    const fileName = `${options.timestamp}-${options.index}.${fileExtension}`
    const filePath = path.join(options.workingDirectory, fileName)
    await writeFile(filePath, bytes)

    return toMarkdownPath(filePath)
  } catch (error) {
    if (isAbortError(error)) {
      return undefined
    }

    context.warn(`Error fetching image ${options.index}: ${errorMessage(error)}`)

    return undefined
  }
}

/**
 * Result of a single redirect-handling hop, indicating either a final response or the next URL to follow.
 */
type HopResult =
  | {
      /** Discriminant marking a final (non-redirect) response. */
      kind: "done"

      /** The fully received response to return to the caller. */
      response: ImpitResponse
    }
  | {
      /** Discriminant marking a redirect that should be followed. */
      kind: "redirect"

      /** Value of the `Location` header, resolved against the current URL by the caller. */
      location: string
    }

/**
 * Execute a single image GET attempt with a bounded timeout, manually following redirects and
 * validating each hop through the SSRF guard. The timeout covers the entire redirect chain so
 * an attacker cannot chain short requests to exceed the intended budget. Transport failures and
 * timeouts are normalised into `FetchError` so they can be retried uniformly.
 *
 * @param url Source URL of the image to download.
 * @param impit Shared HTTP client used for the request.
 * @param signal External abort signal combined with the download timeout.
 * @returns The successful response.
 * @throws {FetchError} When the transport fails, the timeout fires, or the response carries a non-2xx status.
 */
async function attemptImageFetch(url: string, impit: Impit, signal: AbortSignal): Promise<ImpitResponse> {
  const timeoutSignal = AbortSignal.timeout(IMAGE_DOWNLOAD_TIMEOUT_MS)
  const combinedSignal = AbortSignal.any([signal, timeoutSignal])

  return followImageRedirects(impit, url, url, signal, combinedSignal, MAX_REDIRECT_HOPS)
}

/**
 * Recursively issue a GET against `currentUrl`, re-validating the SSRF guard on every hop,
 * until a non-redirect response is returned or the hop budget is exhausted.
 *
 * @param impit Shared HTTP client used for the request.
 * @param originalUrl URL originally requested by the caller, used in the "too many redirects" error and timeout message.
 * @param currentUrl URL to fetch in this attempt.
 * @param signal External abort signal used to distinguish timeouts from user aborts.
 * @param combinedSignal Signal combining the external abort signal with the chain-wide timeout.
 * @param hopsRemaining Number of redirect hops still permitted before aborting.
 * @returns The successful response.
 */
async function followImageRedirects(
  impit: Impit,
  originalUrl: string,
  currentUrl: string,
  signal: AbortSignal,
  combinedSignal: AbortSignal,
  hopsRemaining: number
): Promise<ImpitResponse> {
  await assertPublicUrl(currentUrl)
  const hop = await performImageHop(impit, originalUrl, currentUrl, signal, combinedSignal)

  if (hop.kind === "done") {
    return hop.response
  }

  if (hopsRemaining <= 0) {
    throw new FetchError("Too many redirects", undefined, originalUrl)
  }

  const nextUrl = new URL(hop.location, currentUrl).toString()

  return followImageRedirects(impit, originalUrl, nextUrl, signal, combinedSignal, hopsRemaining - 1)
}

/**
 * Issue a single image GET and classify the response as either a final success or a redirect instruction.
 *
 * @param impit Shared HTTP client used for the request.
 * @param originalUrl URL originally requested by the caller, used as the `url` on timeout errors.
 * @param currentUrl URL to fetch in this hop.
 * @param signal External abort signal used to distinguish timeouts from user aborts.
 * @param combinedSignal Signal combining the external abort signal with the chain-wide timeout.
 * @returns A `done` result carrying the final response, or a `redirect` result carrying the next `Location`.
 */
async function performImageHop(
  impit: Impit,
  originalUrl: string,
  currentUrl: string,
  signal: AbortSignal,
  combinedSignal: AbortSignal
): Promise<HopResult> {
  let response: ImpitResponse

  try {
    response = await impit.fetch(currentUrl, { method: "GET", signal: combinedSignal, redirect: "manual" })
  } catch (error) {
    if (isAbortError(error) && !signal.aborted) {
      throw new FetchError(`Request timed out after ${IMAGE_DOWNLOAD_TIMEOUT_MS}ms`, undefined, originalUrl, {
        cause: error,
      })
    }

    if (isAbortError(error)) {
      throw error
    }

    const message = error instanceof Error ? error.message : String(error)
    throw new FetchError(`Request failed: ${message}`, undefined, currentUrl, { cause: error })
  }

  if (isRedirectStatus(response.status)) {
    const location = response.headers.get("location")

    if (location === null || location === "") {
      throw new FetchError("Redirect missing Location header", response.status, currentUrl)
    }

    return { kind: "redirect", location }
  }

  if (!response.ok) {
    throw new FetchError(`HTTP ${response.status} ${response.statusText}`, response.status, currentUrl)
  }

  return { kind: "done", response }
}

/**
 * Determine whether an HTTP status code represents a followable redirect response.
 *
 * @param status HTTP status code to classify.
 * @returns `true` when the status is in the 3xx range excluding `304 Not Modified`.
 */
function isRedirectStatus(status: number): boolean {
  return status >= HTTP_REDIRECT_MIN && status < HTTP_REDIRECT_MAX_EXCLUSIVE && status !== HTTP_NOT_MODIFIED
}

/**
 * Resolve the extension for a downloaded image by first sniffing the raw bytes for a supported
 * image signature and otherwise falling back to the `content-type` header and URL pathname.
 *
 * @param bytes Downloaded image payload.
 * @param contentType HTTP `content-type` header value, or `null` when absent.
 * @param url Source URL used as a fallback when neither the bytes nor the header are conclusive.
 * @returns The canonical image extension for the payload.
 */
async function sniffImageExtension(bytes: Uint8Array, contentType: string | null, url: string): Promise<string> {
  const sniffed = await fileTypeFromBuffer(bytes)

  if (sniffed !== undefined) {
    const normalized = normalizeImageExtension(sniffed.ext)

    if (isSupportedImageExtension(normalized)) {
      return normalized
    }
  }

  return imageExtensionFromHeaders(contentType, url)
}
