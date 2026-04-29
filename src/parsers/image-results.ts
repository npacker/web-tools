/**
 * Parsing for the DuckDuckGo image-search JSON result list: filters out unsupported formats,
 * deduplicates, and caps to the requested page size. Image-format reasoning lives in the
 * sibling `image-extensions.ts` module so this file stays narrowly scoped to result shaping.
 */

import { hasSupportedImageExtension } from "./image-extensions"

import type { DuckDuckGoImageResult } from "../duckduckgo/search-images"

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
