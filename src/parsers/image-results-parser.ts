/**
 * Parsing utilities for DuckDuckGo image-search JSON results and image URLs.
 */

import path from "node:path"

import { extension as mimeExtension } from "mime-types"

import type { DuckDuckGoImageResult } from "../duckduckgo/search-images"

/**
 * Image file extensions recognized as supported download targets.
 *
 * @const {readonly string[]}
 */
const SUPPORTED_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp", "svg"] as const

/**
 * Fallback extension used when neither content-type nor URL yields a recognised image format.
 *
 * @const {string}
 * @default
 */
const FALLBACK_EXTENSION = "jpg"

/**
 * Extract and validate image URLs from search results.
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
    .filter(url => hasSupportedImageExtension(url))
    .filter(url => {
      if (seenUrls.has(url)) {
        return false
      }

      seenUrls.add(url)

      return true
    })
}

/**
 * Determine the image file extension from a content-type header, falling back to the URL pathname.
 *
 * @param contentType HTTP `content-type` header value, or `null` when absent.
 * @param url Source URL used as a fallback when the content type is missing.
 * @returns Normalized image extension, defaulting to `"jpg"` when neither source is conclusive.
 */
export function imageExtensionFromHeaders(contentType: string | null, url: string): string {
  return extensionFromContentType(contentType) ?? extensionFromUrl(url) ?? FALLBACK_EXTENSION
}

/**
 * Report whether a URL's path ends in a supported image extension.
 *
 * @param url URL to test.
 * @returns `true` when the URL's path ends with a recognised image extension.
 */
export function hasSupportedImageExtension(url: string): boolean {
  return extensionFromUrl(url) !== undefined
}

/**
 * Normalise an image extension to its canonical short form.
 *
 * @param extension Raw extension string.
 * @returns The canonical extension form (`jpeg` to `jpg`, `svg+xml` to `svg`).
 */
export function normalizeImageExtension(extension: string): string {
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
 * Type-guard reporting whether an extension is one of the supported image formats.
 *
 * @param extension Extension string to test.
 * @returns `true` when the extension is listed in `SUPPORTED_IMAGE_EXTENSIONS`.
 */
export function isSupportedImageExtension(extension: string): extension is (typeof SUPPORTED_IMAGE_EXTENSIONS)[number] {
  return SUPPORTED_IMAGE_EXTENSIONS.includes(extension as (typeof SUPPORTED_IMAGE_EXTENSIONS)[number])
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

  const normalized = normalizeImageExtension(raw)

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
    ;({ pathname } = new URL(url))
  } catch {
    return undefined
  }

  const raw = path.extname(pathname).slice(1).toLowerCase()

  if (raw === "") {
    return undefined
  }

  const normalized = normalizeImageExtension(raw)

  return isSupportedImageExtension(normalized) ? normalized : undefined
}
