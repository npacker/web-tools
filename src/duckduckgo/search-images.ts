/**
 * DuckDuckGo image-search entry point.
 */

import { fetchOk } from "../http"

import { buildImageSearchUrl } from "./build-urls"

import type { RequestOptions } from "../http"
import type { SearchParameters } from "./build-urls"
import type { Impit } from "impit"

/**
 * Raw image result entry as returned by the DuckDuckGo image endpoint.
 */
export interface DuckDuckGoImageResult {
  /** Remote URL of the full-resolution image. */
  image: string
}

/**
 * Shape of the JSON body returned by the DuckDuckGo image search endpoint.
 */
interface ImageSearchResponse {
  /** Collection of image results, absent when the query yields nothing. */
  results?: DuckDuckGoImageResult[]
}

/**
 * Perform a DuckDuckGo image search and return the raw result rows.
 *
 * @param impit Shared HTTP client used for the request.
 * @param parameters Query and pagination parameters for the search.
 * @param vqd VQD token previously obtained via `fetchVqdToken`.
 * @param options Options controlling the outbound request.
 * @returns Raw image result entries returned by the DuckDuckGo API.
 */
export async function searchImages(
  impit: Impit,
  parameters: SearchParameters,
  vqd: string,
  options: RequestOptions
): Promise<DuckDuckGoImageResult[]> {
  const url = buildImageSearchUrl(parameters, vqd).toString()
  const response = await fetchOk(impit, url, options)
  const data = (await response.json()) as ImageSearchResponse

  return data.results ?? []
}
