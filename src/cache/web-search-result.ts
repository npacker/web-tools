/**
 * Domain shape of a single web-search result, shared by the cache layer, the DuckDuckGo
 * search adapter, and the enrichment fan-out. Optional metadata fields are populated by the
 * enrichment pass and remain `undefined` for non-HTML pages or failed extractions, so the
 * parser side can construct a record with only the three required fields and the enrichment
 * side can layer extras on top via object spread.
 */
export interface WebSearchResult {
  /** Human-readable title rendered by DuckDuckGo for the result link. */
  label: string
  /** Destination URL of the result link. */
  url: string
  /** Preview snippet extracted from the DuckDuckGo result block; omitted from the wire shape when snippets are disabled in plugin config. */
  snippet?: string
  /** ISO 8601 page date — most recent of `article:modified_time` or `article:published_time` per metascraper, when the page exposed one. */
  date?: string
  /** OpenGraph `og:type` value (for example `article`, `website`), when the page declared one. */
  type?: string
  /** Short page description from OpenGraph, standard meta, or JSON-LD, when the page exposed one. */
  description?: string
}
