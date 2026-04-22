/**
 * Fetch (or cache-hit) the VQD token required for DuckDuckGo image search.
 */

import { isAbortError } from "../errors"
import { fetchOk } from "../http"
import { extractVqdToken } from "../parsers"

import { buildVqdUrl } from "./build-urls"
import { VqdTokenError } from "./vqd-token-error"

import type { TTLCache } from "../cache"
import type { RequestOptions } from "../http"
import type { Impit } from "impit"

/**
 * Retrieve the VQD token for a query, serving a cached value when available and scraping the
 * DuckDuckGo homepage otherwise.
 *
 * @param impit Shared HTTP client used for the scrape request.
 * @param vqdCache Cache holding VQD tokens keyed by query.
 * @param query Search query whose VQD token is required.
 * @param options Options controlling the outbound request.
 * @returns The cached or freshly scraped VQD token.
 * @throws {VqdTokenError} When the homepage cannot be fetched or the token cannot be located.
 */
export async function fetchVqdToken(
  impit: Impit,
  vqdCache: TTLCache<string>,
  query: string,
  options: RequestOptions
): Promise<string> {
  const cacheKey = `vqd:${query}`
  const cached = await vqdCache.get(cacheKey)

  if (cached !== undefined) {
    return cached
  }

  const url = buildVqdUrl(query).toString()
  let html: string

  try {
    const response = await fetchOk(impit, url, options)
    html = await response.text()
  } catch (error) {
    if (isAbortError(error)) {
      throw error
    }

    throw new VqdTokenError("fetch_failed", { cause: error })
  }

  const vqd = extractVqdToken(html)
  await vqdCache.set(cacheKey, vqd)

  return vqd
}
