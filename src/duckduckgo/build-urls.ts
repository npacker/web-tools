/**
 * Pure URL builders and parameter encoders for DuckDuckGo endpoints.
 */

import type { SafeSearch } from "./safe-search"

/**
 * Input parameters shared by web and image search requests.
 */
export interface SearchParameters {
  /** Raw search query string. */
  query: string
  /** Number of results requested per page. */
  pageSize: number
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
 * Path of the DuckDuckGo JSON image search endpoint.
 *
 * @const {string}
 * @default
 */
const IMAGE_SEARCH_PATH = "/i.js"

/**
 * Path of the DuckDuckGo homepage used to scrape VQD tokens.
 *
 * @const {string}
 * @default
 */
const VQD_FETCH_PATH = "/"

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
    url.searchParams.append("s", pageOffset(parameters.pageSize, parameters.page).toString())
  }

  return url
}

/**
 * Build the URL for the DuckDuckGo homepage used to scrape the VQD token.
 *
 * @param query Search query associated with the VQD token request.
 * @returns Fully constructed VQD-scrape URL.
 */
export function buildVqdUrl(query: string): URL {
  const url = new URL(VQD_FETCH_PATH, DUCKDUCKGO_BASE_URL)
  url.searchParams.append("q", query)
  url.searchParams.append("iax", "images")
  url.searchParams.append("ia", "images")

  return url
}

/**
 * Build the URL for the DuckDuckGo image search JSON endpoint.
 *
 * @param parameters Query and pagination parameters for the search.
 * @param vqd VQD token previously obtained via `fetchVqdToken`.
 * @returns Fully constructed image-search URL.
 */
export function buildImageSearchUrl(parameters: SearchParameters, vqd: string): URL {
  const url = new URL(IMAGE_SEARCH_PATH, DUCKDUCKGO_BASE_URL)
  url.searchParams.append("q", parameters.query)
  url.searchParams.append("o", "json")
  url.searchParams.append("l", "us-en")
  url.searchParams.append("vqd", vqd)
  url.searchParams.append("f", ",,,,,")
  url.searchParams.append("p", encodeSafeSearchParameter(parameters.safeSearch))

  if (parameters.page > 1) {
    url.searchParams.append("s", pageOffset(parameters.pageSize, parameters.page).toString())
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
 * Zero-based offset corresponding to a one-based page number at the given page size.
 *
 * @param pageSize Number of results per page.
 * @param page One-based page number.
 * @returns Zero-based offset for the requested page.
 */
function pageOffset(pageSize: number, page: number): number {
  return pageSize * (page - 1)
}
