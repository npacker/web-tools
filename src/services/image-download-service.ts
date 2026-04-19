/**
 * Image download service.
 */

import { writeFile } from "node:fs/promises"
import path from "node:path"

import { Impit } from "impit"

import { IMAGE_DOWNLOAD_TIMEOUT_MS } from "../constants"
import { isAbortError, getErrorMessage } from "../errors"
import { determineImageExtension } from "../parsers"

/**
 * Contextual hooks provided by the caller for logging and cancellation.
 */
export interface DownloadContext {
  /** Logger used to surface non-fatal download failures. */
  warn: (message: string) => void
  /** Signal used to abort the in-flight download. */
  signal: AbortSignal
}

/**
 * Per-download options controlling file placement and naming.
 */
export interface DownloadOptions {
  /** Directory into which the downloaded file is written. */
  workingDirectory: string
  /** Epoch-millisecond timestamp used as the filename prefix. */
  timestamp: number
  /** Zero-based index of the image within the current batch. */
  index: number
}

/**
 * Downloads an image from a URL and saves it locally.
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
  options: DownloadOptions,
  context: DownloadContext
): Promise<string | undefined> {
  try {
    const response = await fetchImageWithTimeout(url, impit, context.signal)

    if (!response.ok) {
      context.warn(`Failed to fetch image ${options.index}: ${response.statusText}`)
      return undefined
    }

    const bytes = await response.bytes()

    if (bytes.length === 0) {
      context.warn(`Image ${options.index} is empty: ${url}`)
      return undefined
    }

    const fileExtension = determineImageExtension(response.headers.get("content-type"), url)
    const fileName = `${options.timestamp}-${options.index}.${fileExtension}`
    const filePath = path.join(options.workingDirectory, fileName)

    await writeFile(filePath, bytes)

    const localPath = normalizePath(filePath)

    return localPath
  } catch (error) {
    if (isAbortError(error)) {
      return undefined
    }

    context.warn(`Error fetching image ${options.index}: ${getErrorMessage(error)}`)
    return undefined
  }
}

/**
 * Fetches an image with timeout protection.
 *
 * @param url Source URL of the image to download.
 * @param impit Shared HTTP client used for the request.
 * @param signal External abort signal combined with the download timeout.
 * @returns The raw response from the HTTP client.
 */
async function fetchImageWithTimeout(
  url: string,
  impit: Impit,
  signal: AbortSignal
): Promise<ReturnType<Impit["fetch"]>> {
  const timeoutSignal = AbortSignal.timeout(IMAGE_DOWNLOAD_TIMEOUT_MS)
  const combinedSignal = AbortSignal.any([signal, timeoutSignal])

  return impit.fetch(url, {
    method: "GET",
    signal: combinedSignal,
  })
}

/**
 * Normalizes file path for cross-platform compatibility.
 *
 * @param filePath Absolute filesystem path produced by `path.join`.
 * @returns Path using forward slashes and with Windows drive letters removed.
 */
function normalizePath(filePath: string): string {
  return filePath.replaceAll("\\", "/").replace(/^\/?[A-Z]:/, "")
}
