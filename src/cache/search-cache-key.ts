/**
 * Cache-key and payload definitions for search-result caching.
 */

import type { SafeSearch } from "../types"

/**
 * Cached payload for a web or image search.
 */
export interface CachedSearchResults {
  /** Result tuples of `[label, url]` pairs. */
  results: Array<[string, string]>
  /** Number of results in `results`. */
  count: number
}

/**
 * Build the cache key used for a search-result lookup or insertion.
 *
 * @param type Whether the entry represents a web or image search.
 * @param query Search query string.
 * @param safeSearch Safe-search mode that produced the entry.
 * @param page One-based page number of the entry.
 * @returns Canonical cache key for the given parameters.
 */
export function searchCacheKey(type: "web" | "image", query: string, safeSearch: SafeSearch, page: number): string {
  return `${type}:${query}:${safeSearch}:${page}`
}
