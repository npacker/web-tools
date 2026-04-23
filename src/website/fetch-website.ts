/**
 * Fetch HTML from arbitrary websites with on-disk TTL caching keyed by URL.
 */

import { fetchOk, readLimitedText } from "../http"

import type { TTLCache } from "../cache"
import type { RequestOptions } from "../http"
import type { Impit } from "impit"

/**
 * Options controlling an outbound website fetch.
 */
interface FetchWebsiteOptions extends RequestOptions {
  /** Hard upper bound on the HTML payload, in bytes. */
  maxBytes: number
}

/**
 * Fetch the HTML at `url`, returning a cached payload when one is available.
 *
 * @param impit Shared HTTP client used for the request.
 * @param cache Cache holding recent HTML payloads keyed by URL.
 * @param url Target URL to fetch.
 * @param options Options controlling the outbound request.
 * @returns The response body as a decoded string.
 * @throws {FetchError} When the response carries a non-2xx status or exceeds the size cap.
 */
export async function fetchWebsite(
  impit: Impit,
  cache: TTLCache<string>,
  url: string,
  options: FetchWebsiteOptions
): Promise<string> {
  const cached = await cache.get(url)

  if (cached !== undefined) {
    return cached
  }

  const response = await fetchOk(impit, url, options)
  const html = await readLimitedText(response, options.maxBytes, url)
  await cache.set(url, html)

  return html
}
