/**
 * Cache-key helpers for search-result caching.
 */

import type { SafeSearch } from "../duckduckgo/safe-search"

/**
 * Build the cache key used for a search-result lookup or insertion. The `enriched` flag is
 * part of the key because the stored payload shape differs — enriched entries carry per-result
 * metadata (date, type, description) while raw entries do not, so a hit must match the caller's
 * current enrichment preference rather than serve a payload of the wrong shape.
 *
 * @param type Whether the entry represents a web or image search.
 * @param query Search query string.
 * @param safeSearch Safe-search mode that produced the entry.
 * @param page One-based page number of the entry.
 * @param enriched Whether the cached payload was produced with the metascraper enrichment fan-out.
 * @returns Canonical cache key for the given parameters.
 */
export function searchCacheKey(
  type: "web" | "image",
  query: string,
  safeSearch: SafeSearch,
  page: number,
  enriched: boolean
): string {
  return `${type}:${query}:${safeSearch}:${page}:${enriched ? "enriched" : "raw"}`
}
