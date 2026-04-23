/**
 * Cached wire shape for a web search, stored in the TTLCache.
 */
export interface SearchResultsPayload {
  /** Result tuples of `[label, url, snippet]` triples. */
  results: [string, string, string][]
  /** Number of results in `results`. */
  count: number
}
