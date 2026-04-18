/**
 * Image URL parsing utilities
 */

import { SUPPORTED_IMAGE_EXTENSIONS } from "../constants"
import type { DuckDuckGoImageResult } from "../types"

const IMAGE_EXTENSION_PATTERN = /\.(jpg|jpeg|png|gif|webp)(\?|$)/i

/**
 * Extracts and validates image URLs from search results
 */
export function extractImageUrls(results: DuckDuckGoImageResult[], maxResults: number): string[] {
  const seenUrls = new Set<string>()

  return results
    .slice(0, maxResults)
    .map(result => result.image)
    .filter(isValidImageUrl)
    .filter(url => {
      if (seenUrls.has(url)) {
        return false
      }
      seenUrls.add(url)
      return true
    })
}

/**
 * Checks if a URL has a valid image extension
 */
function isValidImageUrl(url: string): boolean {
  return IMAGE_EXTENSION_PATTERN.test(url)
}

/**
 * Determines file extension from content type or URL
 */
export function determineImageExtension(contentType: string | null, url: string): string {
  const contentTypeExt = extractExtensionFromContentType(contentType)

  if (contentTypeExt !== undefined) {
    return normalizeExtension(contentTypeExt)
  }

  const urlExt = extractExtensionFromUrl(url)

  if (urlExt !== undefined) {
    return normalizeExtension(urlExt)
  }

  return "jpg"
}

/**
 * Extracts extension from content-type header
 */
function extractExtensionFromContentType(contentType: string | null): string | undefined {
  if (contentType === null) {
    return undefined
  }

  const match = contentType.match(/image\/(jpeg|jpg|png|gif|webp)/i)

  return match?.[1]
}

/**
 * Extracts extension from URL
 */
function extractExtensionFromUrl(url: string): string | undefined {
  const match = url.match(IMAGE_EXTENSION_PATTERN)

  return match?.[1]
}

/**
 * Normalizes image extension (jpeg -> jpg)
 */
function normalizeExtension(ext: string): string {
  return ext === "jpeg" ? "jpg" : ext
}

/**
 * Checks if an extension is a supported image format
 */
export function isSupportedImageExtension(ext: string): ext is (typeof SUPPORTED_IMAGE_EXTENSIONS)[number] {
  return SUPPORTED_IMAGE_EXTENSIONS.includes(ext as (typeof SUPPORTED_IMAGE_EXTENSIONS)[number])
}
