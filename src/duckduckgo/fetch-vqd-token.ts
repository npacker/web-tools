/**
 * Fetch (or cache-hit) the VQD token required for DuckDuckGo image search.
 */

import { Impit } from "impit"

import { TTLCache } from "../cache"
import { VqdTokenError } from "../errors"
import { fetchOk } from "../http"
import { extractVqdToken } from "../parsers"

import { buildVqdUrl } from "./build-urls"

import type { RequestOptions } from "../http"

/**
 * Retrieve the VQD token for a query, serving a cached value when available and scraping the
 * DuckDuckGo homepage otherwise.
 *
 * @param impit Shared HTTP client used for the scrape request.
 * @param vqdCache Cache holding VQD tokens keyed by query.
 * @param query Search query whose VQD token is required.
 * @param options Options controlling the outbound request.
 * @returns The cached or freshly scraped VQD token.
 * @throws {VqdTokenError} When the token cannot be located in the response HTML.
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
  const response = await fetchOk(impit, url, options)
  const html = await response.text()
  const vqd = extractVqdToken(html)

  if (vqd === undefined) {
    throw new VqdTokenError()
  }

  await vqdCache.set(cacheKey, vqd)

  return vqd
}
