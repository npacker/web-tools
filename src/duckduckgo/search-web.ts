/**
 * DuckDuckGo web-search entry point.
 */

import { fetchOk } from "../http"
import { parseSearchResults } from "../parsers"

import { buildWebSearchUrl } from "./build-urls"

import type { SearchResultsPayload } from "../cache"
import type { RequestOptions } from "../http"
import type { SearchParameters } from "./build-urls"
import type { Impit } from "impit"

/**
 * Perform a DuckDuckGo web search and return the parsed result records.
 *
 * @param impit Shared HTTP client used for the request.
 * @param parameters Query and pagination parameters for the search.
 * @param maxResults Upper bound on the number of parsed results returned; `Infinity` for no cap.
 * @param options Options controlling the outbound request.
 * @returns The parsed search results along with their count, ready for enrichment.
 */
export async function searchWeb(
  impit: Impit,
  parameters: SearchParameters,
  maxResults: number,
  options: RequestOptions
): Promise<SearchResultsPayload> {
  const url = buildWebSearchUrl(parameters).toString()
  const response = await fetchOk(impit, url, options)
  const html = await response.text()
  const results = parseSearchResults(html, maxResults)

  return {
    results,
    count: results.length,
  }
}
