/**
 * Fetch HTML from arbitrary websites with on-disk TTL caching keyed by URL.
 */

import { fetchOk } from "../http"

import type { TTLCache } from "../cache"
import type { Impit } from "impit"

/**
 * Options controlling an outbound website fetch.
 */
interface FetchWebsiteOptions {
  /** Signal used to abort the in-flight request. */
  signal: AbortSignal
}

/**
 * Fetch the HTML at `url`, returning a cached payload when one is available.
 *
 * @param impit Shared HTTP client used for the request.
 * @param cache Cache holding recent HTML payloads keyed by URL.
 * @param url Target URL to fetch.
 * @param options Options controlling the outbound request.
 * @returns The response body as a UTF-8 string.
 * @throws {FetchError} When the response carries a non-2xx status.
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

  const response = await fetchOk(impit, url, { signal: options.signal })
  const html = await response.text()
  await cache.set(url, html)

  return html
}
