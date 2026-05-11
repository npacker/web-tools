import type { BingImageResult } from "../bing"

/**
 * Cached wire shape for an image search, stored in the TTLCache.
 */
export interface ImageSearchResultsPayload {
  /** Image records carrying Bing's full-resolution image URL plus optional title and source-page metadata. */
  results: BingImageResult[]
  /** Number of results in `results`. */
  count: number
}
