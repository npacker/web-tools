/**
 * Bing image-search entry point. Fetches the image-results HTML and extracts the per-tile
 * metadata embedded in each `<a class="iusc">` element's `m` attribute.
 */

import { fetchOk } from "../http"

import { buildBingImageSearchUrl } from "./build-urls"
import { parseBingImageResults } from "./parse-results"

import type { RequestOptions } from "../http"
import type { BingImageSearchParameters } from "./build-urls"
import type { BingImageResult } from "./parse-results"
import type { Impit } from "impit"

/**
 * `Referer` value sent with image-search requests so Bing treats the call as a legitimate
 * in-page navigation rather than a scripted hit.
 */
const IMAGE_SEARCH_REFERER = "https://www.bing.com/"

/**
 * Perform a Bing image search and return the parsed result rows.
 *
 * @param impit - Shared HTTP client used for the request.
 * @param parameters - Query and pagination parameters for the search.
 * @param maxResults - Upper bound on the number of records to return from the response.
 * @param options - Options controlling the outbound request.
 * @returns Image records extracted from the response HTML, capped at `maxResults`.
 */
export async function searchImages(
  impit: Impit,
  parameters: BingImageSearchParameters,
  maxResults: number,
  options: RequestOptions
): Promise<BingImageResult[]> {
  const url = buildBingImageSearchUrl(parameters).toString()
  const response = await fetchOk(impit, url, {
    ...options,
    headers: { ...options.headers, Referer: IMAGE_SEARCH_REFERER },
  })
  const html = await response.text()

  return parseBingImageResults(html).slice(0, maxResults)
}
