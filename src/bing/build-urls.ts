/**
 * Pure URL builders for Bing image search.
 */

import type { SafeSearch } from "../duckduckgo/safe-search"

/**
 * Input parameters for a Bing image search request.
 */
export interface BingImageSearchParameters {
  /** Raw search query string. */
  query: string
  /** Safe-search mode applied to the request. */
  safeSearch: SafeSearch
  /** One-based page number of the request. */
  page: number
}

/**
 * Base URL used for Bing image search requests.
 */
const BING_BASE_URL = "https://www.bing.com"

/**
 * Path of the Bing image search HTML endpoint.
 */
const IMAGE_SEARCH_PATH = "/images/search"

/**
 * Native page size for Bing image search results. Each fetched page returns
 * approximately this many image tiles, regardless of how many the caller wants
 * to display, so pagination advances the `first` parameter by this stride.
 */
const BING_IMAGE_PAGE_SIZE = 35

/**
 * Build the URL for a Bing image search. Bing's `adlt` query parameter accepts the literal
 * `SafeSearch` mode strings (`"strict"`, `"moderate"`, `"off"`) without further encoding.
 *
 * @param parameters - Query and pagination parameters for the search.
 * @returns Fully constructed image-search URL.
 */
export function buildBingImageSearchUrl(parameters: BingImageSearchParameters): URL {
  const url = new URL(IMAGE_SEARCH_PATH, BING_BASE_URL)
  url.searchParams.append("q", parameters.query)
  url.searchParams.append("form", "HDRSC2")
  url.searchParams.append("adlt", parameters.safeSearch)

  if (parameters.page > 1) {
    url.searchParams.append("first", (1 + (parameters.page - 1) * BING_IMAGE_PAGE_SIZE).toString())
  }

  return url
}
