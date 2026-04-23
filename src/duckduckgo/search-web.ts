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
 * Perform a DuckDuckGo web search and return the parsed result tuples.
 *
 * @param impit Shared HTTP client used for the request.
 * @param parameters Query and pagination parameters for the search.
 * @param options Options controlling the outbound request.
 * @returns The parsed search results along with their count.
 */
export async function searchWeb(
  impit: Impit,
  parameters: SearchParameters,
  options: RequestOptions
): Promise<SearchResultsPayload> {
  const url = buildWebSearchUrl(parameters).toString()
  const response = await fetchOk(impit, url, options)
  const html = await response.text()
  const parsed = parseSearchResults(html, parameters.pageSize)
  const results = parsed.map(
    ({ label, url: resultUrl, snippet }) => [label, resultUrl, snippet] as [string, string, string]
  )

  return {
    results,
    count: results.length,
  }
}
