import type { WebSearchResult } from "./web-search-result"

/**
 * Cached wire shape for a web search, stored in the TTLCache.
 */
export interface SearchResultsPayload {
  /** Result records carrying the DuckDuckGo title/url/snippet plus optional enrichment metadata. */
  results: WebSearchResult[]
  /** Number of results in `results`. */
  count: number
}
