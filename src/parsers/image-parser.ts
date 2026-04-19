/**
 * Image URL parsing utilities
 */

import { SUPPORTED_IMAGE_EXTENSIONS } from "../constants"

import type { DuckDuckGoImageResult } from "../types"

const IMAGE_EXTENSION_PATTERN = /\.(jpg|jpeg|png|gif|webp)(?:\?|$)/i

/**
 * Extracts and validates image URLs from search results
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
 * Checks if a URL has a valid image extension
 */
function isValidImageUrl(url: string): boolean {
  return IMAGE_EXTENSION_PATTERN.test(url)
}

/**
 * Determines file extension from content type or URL
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
 * Extracts extension from content-type header
 */
function extractExtensionFromContentType(contentType: string | null): string | undefined {
  if (contentType === null) {
    return undefined
  }

  const match = /image\/(jpeg|jpg|png|gif|webp)/i.exec(contentType)

  return match?.[1]
}

/**
 * Extracts extension from URL
 */
function extractExtensionFromUrl(url: string): string | undefined {
  const match = IMAGE_EXTENSION_PATTERN.exec(url)

  return match?.[1]
}

/**
 * Normalizes image extension (jpeg -> jpg)
 */
function normalizeExtension(extension: string): string {
  return extension === "jpeg" ? "jpg" : extension
}

/**
 * Checks if an extension is a supported image format
 */
export function isSupportedImageExtension(extension: string): extension is (typeof SUPPORTED_IMAGE_EXTENSIONS)[number] {
  return SUPPORTED_IMAGE_EXTENSIONS.includes(extension as (typeof SUPPORTED_IMAGE_EXTENSIONS)[number])
}
