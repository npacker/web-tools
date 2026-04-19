/**
 * Single-URL image download primitive.
 */

import { writeFile } from "node:fs/promises"
import path from "node:path"

import { fileTypeFromBuffer } from "file-type"
import { Impit } from "impit"

import { isAbortError, errorMessage } from "../errors"
import { toMarkdownPath } from "../fs"
import { imageExtensionFromHeaders, isSupportedImageExtension, normalizeImageExtension } from "../parsers"

/**
 * Timeout applied to each image download, in milliseconds.
 */
const IMAGE_DOWNLOAD_TIMEOUT_MS = 10_000

/**
 * Contextual hooks provided by the caller for logging and cancellation.
 */
interface DownloadImageContext {
  /** Logger used to surface non-fatal download failures. */
  warn: (message: string) => void
  /** Signal used to abort the in-flight download. */
  signal: AbortSignal
}

/**
 * Per-download options controlling file placement and naming.
 */
interface DownloadImageOptions {
  /** Directory into which the downloaded file is written. */
  workingDirectory: string
  /** Epoch-millisecond timestamp used as the filename prefix. */
  timestamp: number
  /** Zero-based index of the image within the current batch. */
  index: number
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
    const response = await fetchImage(url, impit, context.signal)

    if (!response.ok) {
      context.warn(`Failed to fetch image ${options.index}: ${response.statusText}`)

      return undefined
    }

    const bytes = await response.bytes()

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
 * Issue the image GET request with a combined external + timeout abort signal.
 *
 * @param url Source URL of the image to download.
 * @param impit Shared HTTP client used for the request.
 * @param signal External abort signal combined with the download timeout.
 * @returns The raw response from the HTTP client.
 */
async function fetchImage(url: string, impit: Impit, signal: AbortSignal): Promise<ReturnType<Impit["fetch"]>> {
  const timeoutSignal = AbortSignal.timeout(IMAGE_DOWNLOAD_TIMEOUT_MS)
  const combinedSignal = AbortSignal.any([signal, timeoutSignal])

  return impit.fetch(url, {
    method: "GET",
    signal: combinedSignal,
  })
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
