/**
 * Cached wire shape for a web or image search, stored in the TTLCache.
 */
export interface SearchResultsPayload {
  /** Result tuples of `[label, url]` pairs. */
  results: [string, string][]
  /** Number of results in `results`. */
  count: number
}
