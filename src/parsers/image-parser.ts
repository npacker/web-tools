/**
 * Image URL parsing utilities.
 */

import type { DuckDuckGoImageResult } from "../types"

/**
 * Image file extensions recognized as supported download targets.
 */
const SUPPORTED_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp"] as const
const IMAGE_EXTENSION_PATTERN = /\.(jpg|jpeg|png|gif|webp)(?:\?|$)/i

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
 * @returns `true` when the URL ends with a recognised image extension.
 */
function isValidImageUrl(url: string): boolean {
  return IMAGE_EXTENSION_PATTERN.test(url)
}

/**
 * Determines file extension from content type or URL.
 *
 * @param contentType HTTP `content-type` header value, or `null` when absent.
 * @param url Source URL used as a fallback when the content type is missing.
 * @returns Normalized image extension, defaulting to `"jpg"` when neither source is conclusive.
 */
export function determineImageExtension(contentType: string | null, url: string): string {
  const contentTypeExtension = extractExtensionFromContentType(contentType)

  if (contentTypeExtension !== undefined) {
    return normalizeExtension(contentTypeExtension)
  }

  const urlExtension = extractExtensionFromUrl(url)

  if (urlExtension !== undefined) {
    return normalizeExtension(urlExtension)
  }

  return "jpg"
}

/**
 * Extracts extension from content-type header.
 *
 * @param contentType HTTP `content-type` header value, or `null` when absent.
 * @returns The raw extension found in the header, or `undefined` when unrecognized.
 */
function extractExtensionFromContentType(contentType: string | null): string | undefined {
  if (contentType === null) {
    return undefined
  }

  const match = /image\/(jpeg|jpg|png|gif|webp)/i.exec(contentType)

  return match?.[1]
}

/**
 * Extracts extension from URL.
 *
 * @param url URL to inspect.
 * @returns The raw extension found in the URL, or `undefined` when missing.
 */
function extractExtensionFromUrl(url: string): string | undefined {
  const match = IMAGE_EXTENSION_PATTERN.exec(url)

  return match?.[1]
}

/**
 * Normalizes image extension (jpeg -> jpg).
 *
 * @param extension Raw extension string.
 * @returns The canonical extension form.
 */
function normalizeExtension(extension: string): string {
  return extension === "jpeg" ? "jpg" : extension
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
