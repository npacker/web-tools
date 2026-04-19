/**
 * Image URL parsing utilities.
 */

import path from "node:path"

import { extension as mimeExtension } from "mime-types"

import type { DuckDuckGoImageResult } from "../types"

/**
 * Image file extensions recognized as supported download targets.
 */
const SUPPORTED_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp", "svg"] as const
/**
 * Fallback extension used when neither content-type nor URL yields a recognised image format.
 */
const FALLBACK_EXTENSION = "jpg"

/**
 * Extracts and validates image URLs from search results.
 *
 * @param results Raw image search result entries returned by DuckDuckGo.
 * @param maxResults Upper bound on the number of URLs to return.
 * @returns Deduplicated list of valid image URLs, capped at `maxResults`.
 */
export function extractImageUrls(results: DuckDuckGoImageResult[], maxResults: number): string[] {
  const seenUrls = new Set<string>()

  return results
    .slice(0, maxResults)
    .map(result => result.image)
    .filter(url => isValidImageUrl(url))
    .filter(url => {
      if (seenUrls.has(url)) {
        return false
      }

      seenUrls.add(url)

      return true
    })
}

/**
 * Checks if a URL has a valid image extension.
 *
 * @param url URL to test.
 * @returns `true` when the URL's path ends with a recognised image extension.
 */
function isValidImageUrl(url: string): boolean {
  return extensionFromUrl(url) !== undefined
}

/**
 * Determines file extension from content type or URL.
 *
 * @param contentType HTTP `content-type` header value, or `null` when absent.
 * @param url Source URL used as a fallback when the content type is missing.
 * @returns Normalized image extension, defaulting to `"jpg"` when neither source is conclusive.
 */
export function determineImageExtension(contentType: string | null, url: string): string {
  return extensionFromContentType(contentType) ?? extensionFromUrl(url) ?? FALLBACK_EXTENSION
}

/**
 * Extract a supported image extension from a content-type header.
 *
 * @param contentType HTTP `content-type` header value, or `null` when absent.
 * @returns The canonical extension when the header names a supported image type, otherwise `undefined`.
 */
function extensionFromContentType(contentType: string | null): string | undefined {
  if (contentType === null) {
    return undefined
  }

  const raw = mimeExtension(contentType)

  if (raw === false) {
    return undefined
  }

  const normalized = normalizeExtension(raw)

  return isSupportedImageExtension(normalized) ? normalized : undefined
}

/**
 * Extract a supported image extension from a URL's pathname.
 *
 * @param url URL to inspect.
 * @returns The canonical extension when the path ends with a supported image extension, otherwise `undefined`.
 */
function extensionFromUrl(url: string): string | undefined {
  let pathname: string

  try {
    pathname = new URL(url).pathname
  } catch {
    return undefined
  }

  const raw = path.extname(pathname).slice(1).toLowerCase()

  if (raw === "") {
    return undefined
  }

  const normalized = normalizeExtension(raw)

  return isSupportedImageExtension(normalized) ? normalized : undefined
}

/**
 * Normalize an image extension to its canonical short form.
 *
 * @param extension Raw extension string.
 * @returns The canonical extension form (`jpeg` to `jpg`, `svg+xml` to `svg`).
 */
export function normalizeExtension(extension: string): string {
  const lower = extension.toLowerCase()

  if (lower === "jpeg") {
    return "jpg"
  }

  if (lower === "svg+xml") {
    return "svg"
  }

  return lower
}

/**
 * Checks if an extension is a supported image format.
 *
 * @param extension Extension string to test.
 * @returns `true` when the extension is listed in `SUPPORTED_IMAGE_EXTENSIONS`.
 */
export function isSupportedImageExtension(extension: string): extension is (typeof SUPPORTED_IMAGE_EXTENSIONS)[number] {
  return SUPPORTED_IMAGE_EXTENSIONS.includes(extension as (typeof SUPPORTED_IMAGE_EXTENSIONS)[number])
}
