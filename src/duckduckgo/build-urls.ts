/**
 * Pure URL builders and parameter encoders for DuckDuckGo web search.
 */

import type { SafeSearch } from "./safe-search"

/**
 * Input parameters for a DuckDuckGo web search request.
 */
export interface SearchParameters {
  /** Raw search query string. */
  query: string
  /** Offset stride used to advance DuckDuckGo's `s=` parameter between pages. */
  pageStride: number
  /** Safe-search mode applied to the request. */
  safeSearch: SafeSearch
  /** One-based page number of the request. */
  page: number
}

/**
 * Base URL used for all DuckDuckGo requests.
 *
 * @const {string}
 * @default
 */
const DUCKDUCKGO_BASE_URL = "https://duckduckgo.com"

/**
 * Path of the DuckDuckGo HTML web search endpoint.
 *
 * @const {string}
 * @default
 */
const WEB_SEARCH_PATH = "/html/"

/**
 * Build the URL for a DuckDuckGo web search.
 *
 * @param parameters Query and pagination parameters for the search.
 * @returns Fully constructed web-search URL.
 */
export function buildWebSearchUrl(parameters: SearchParameters): URL {
  const url = new URL(WEB_SEARCH_PATH, DUCKDUCKGO_BASE_URL)
  url.searchParams.append("q", parameters.query)
  url.searchParams.append("p", encodeSafeSearchParameter(parameters.safeSearch))

  if (parameters.page > 1) {
    url.searchParams.append("s", pageOffset(parameters.pageStride, parameters.page).toString())
  }

  return url
}

/**
 * Encode a `SafeSearch` mode as the DuckDuckGo-specific `p` query parameter value.
 *
 * @param safeSearch Safe-search mode selected by the caller.
 * @returns The `p` parameter string: `"1"` for strict, `""` for moderate, `"-1"` for off.
 */
function encodeSafeSearchParameter(safeSearch: SafeSearch): string {
  if (safeSearch === "moderate") {
    return ""
  }

  return safeSearch === "strict" ? "1" : "-1"
}

/**
 * Zero-based offset corresponding to a one-based page number at the given stride.
 *
 * @param pageStride Offset stride between pages.
 * @param page One-based page number.
 * @returns Zero-based offset for the requested page.
 */
function pageOffset(pageStride: number, page: number): number {
  return pageStride * (page - 1)
}
