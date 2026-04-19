/**
 * Image download service
 */

import { writeFile } from "node:fs/promises"
import path from "node:path"

import { Impit } from "impit"

import { IMAGE_DOWNLOAD_TIMEOUT_MS } from "../constants"
import { isAbortError, getErrorMessage } from "../errors"
import { determineImageExtension } from "../parsers"

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
  return filePath.replaceAll("\\", "/").replace(/^\/?[A-Z]:/, "")
}
