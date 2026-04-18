/**
 * Image download service
 */

import { join } from "path"
import { writeFile } from "fs/promises"
import { Impit } from "impit"
import { IMAGE_DOWNLOAD_TIMEOUT_MS } from "../constants"
import { determineImageExtension } from "../parsers"
import { isAbortError, getErrorMessage } from "../errors"

export interface DownloadContext {
  warn: (message: string) => void
  signal: AbortSignal
}

export interface DownloadOptions {
  workingDirectory: string
  timestamp: number
  index: number
}

/**
 * Downloads an image from a URL and saves it locally
 */
export async function downloadImage(
  url: string,
  impit: Impit,
  options: DownloadOptions,
  context: DownloadContext
): Promise<string | null> {
  try {
    const response = await fetchImageWithTimeout(url, impit, context.signal)

    if (!response.ok) {
      context.warn(`Failed to fetch image ${options.index}: ${response.statusText}`)
      return null
    }

    const bytes = await response.bytes()

    if (bytes.length === 0) {
      context.warn(`Image ${options.index} is empty: ${url}`)
      return null
    }

    const fileExtension = determineImageExtension(response.headers.get("content-type"), url)
    const fileName = `${options.timestamp}-${options.index}.${fileExtension}`
    const filePath = join(options.workingDirectory, fileName)

    await writeFile(filePath, bytes)

    const localPath = normalizePath(filePath)

    return localPath
  } catch (error) {
    if (isAbortError(error)) {
      return null
    }

    context.warn(`Error fetching image ${options.index}: ${getErrorMessage(error)}`)
    return null
  }
}

/**
 * Fetches an image with timeout protection
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
 * Normalizes file path for cross-platform compatibility
 */
function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^(?:\/)?[A-Z]:/, "")
}
