/**
 * Shared `impit` GET helper that throws on non-2xx responses and retries transient failures via `p-retry`.
 */

import pRetry from "p-retry"

import { FetchError } from "./fetch-error"
import { isRetryableFetchError } from "./retry"
import { assertPublicUrl } from "./url-guard"

import type { RetryOptions } from "./retry"
import type { Impit } from "impit"
import type { Options as PRetryOptions } from "p-retry"

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
 * Options passed to every outbound request, primarily to support cancellation and retries.
 */
export interface RequestOptions {
  /** Signal used to abort the in-flight request. */
  signal: AbortSignal
  /** Retry policy applied to the request; when omitted, the call is attempted exactly once. */
  retry?: RetryOptions
  /** Observer invoked after each failed attempt, before the backoff sleep. */
  onFailedAttempt?: PRetryOptions["onFailedAttempt"]
  /** Extra request headers layered onto the `impit` browser-impersonation defaults. */
  headers?: Record<string, string>
}

/**
 * Result of a single redirect-handling hop, indicating either a final response or the next URL to follow.
 */
type HopResult =
  | {
      /** Discriminant marking a final (non-redirect) response. */
      kind: "done"

      /** The fully received response to return to the caller. */
      response: Awaited<ReturnType<Impit["fetch"]>>
    }
  | {
      /** Discriminant marking a redirect that should be followed. */
      kind: "redirect"

      /** Value of the `Location` header, resolved against the current URL by the caller. */
      location: string
    }

/**
 * Issue a GET request through the shared `impit` client, throwing `FetchError` on failure or non-2xx.
 *
 * @param impit Shared HTTP client used for the request.
 * @param url Target URL to fetch.
 * @param options Options controlling the outbound request.
 * @returns The successful response.
 * @throws {FetchError} When the transport fails or the response carries a non-2xx status.
 */
export async function fetchOk(impit: Impit, url: string, options: RequestOptions): Promise<ReturnType<Impit["fetch"]>> {
  return pRetry(async () => attemptFetch(impit, url, options.signal, options.headers), {
    retries: 0,
    ...options.retry,
    signal: options.signal,

    /**
     * Gate retries on the `FetchError.statusCode` allowlist so non-transient failures fail fast.
     *
     * @param context Retry context supplied by `p-retry`; only `error` is consulted.
     * @param context.error Error thrown by the most recent attempt.
     * @returns `true` when the error is a transient fetch failure that warrants another attempt.
     */
    shouldRetry: ({ error }) => isRetryableFetchError(error),
    onFailedAttempt: options.onFailedAttempt,
  })
}

/**
 * Execute a single GET attempt, manually following redirects and validating each hop through
 * the SSRF guard. Transport failures and redirect anomalies are normalised into `FetchError`.
 *
 * @param impit Shared HTTP client used for the request.
 * @param url Target URL to fetch.
 * @param signal Signal used to abort the in-flight request.
 * @param headers Extra request headers layered onto every hop.
 * @returns The successful response.
 */
async function attemptFetch(
  impit: Impit,
  url: string,
  signal: AbortSignal,
  headers: Record<string, string> | undefined
): Promise<Awaited<ReturnType<Impit["fetch"]>>> {
  return followRedirects(impit, url, url, signal, headers, MAX_REDIRECT_HOPS)
}

/**
 * Recursively issue a GET against `currentUrl`, re-validating the SSRF guard on every hop,
 * until a non-redirect response is returned or the hop budget is exhausted.
 *
 * @param impit Shared HTTP client used for the request.
 * @param originalUrl URL originally requested by the caller, used in the "too many redirects" error.
 * @param currentUrl URL to fetch in this attempt.
 * @param signal Signal used to abort the in-flight request.
 * @param headers Extra request headers layered onto every hop.
 * @param hopsRemaining Number of redirect hops still permitted before aborting.
 * @returns The successful response.
 */
async function followRedirects(
  impit: Impit,
  originalUrl: string,
  currentUrl: string,
  signal: AbortSignal,
  headers: Record<string, string> | undefined,
  hopsRemaining: number
): Promise<Awaited<ReturnType<Impit["fetch"]>>> {
  await assertPublicUrl(currentUrl)
  const hop = await performHop(impit, currentUrl, signal, headers)

  if (hop.kind === "done") {
    return hop.response
  }

  if (hopsRemaining <= 0) {
    throw new FetchError("Too many redirects", undefined, originalUrl)
  }

  const nextUrl = new URL(hop.location, currentUrl).toString()

  return followRedirects(impit, originalUrl, nextUrl, signal, headers, hopsRemaining - 1)
}

/**
 * Issue a single GET and classify the response as either a final success or a redirect instruction.
 *
 * @param impit Shared HTTP client used for the request.
 * @param currentUrl URL to fetch in this hop.
 * @param signal Signal used to abort the in-flight request.
 * @param headers Extra request headers layered onto the `impit` browser-impersonation defaults.
 * @returns A `done` result carrying the final response, or a `redirect` result carrying the next `Location`.
 */
async function performHop(
  impit: Impit,
  currentUrl: string,
  signal: AbortSignal,
  headers: Record<string, string> | undefined
): Promise<HopResult> {
  let response: Awaited<ReturnType<Impit["fetch"]>>

  try {
    response = await impit.fetch(currentUrl, { method: "GET", signal, redirect: "manual", headers })
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
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
