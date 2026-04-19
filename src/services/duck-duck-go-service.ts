/**
 * DuckDuckGo API service for web and image searches.
 */

import { Impit } from "impit"

import { TTLCache } from "../cache"
import { DUCKDUCKGO_BASE_URL, WEB_SEARCH_PATH, IMAGE_SEARCH_PATH, VQD_FETCH_PATH } from "../constants"
import { FetchError, VqdTokenError } from "../errors"
import { extractVqdToken, parseWebSearchResults } from "../parsers"

import type { SafeSearch, SearchParameters, SearchCacheEntry, DuckDuckGoImageResult } from "../types"

/**
 * Options passed to every outbound request, primarily to support cancellation.
 */
export interface FetchOptions {
  /** Signal used to abort the in-flight request. */
  signal: AbortSignal
}

/**
 * Shape of the JSON body returned by the DuckDuckGo image search endpoint.
 */
interface ImageSearchResponseBody {
  /** Collection of image results, absent when the query yields nothing. */
  results?: DuckDuckGoImageResult[]
}

/**
 * Thin wrapper around the DuckDuckGo endpoints used for web and image search.
 */
export class DuckDuckGoService {
  /** Shared HTTP client configured with browser-like TLS and header fingerprints. */
  private readonly impit: Impit
  /** Cache of VQD tokens scraped from the DuckDuckGo homepage, keyed by query. */
  private readonly vqdCache: TTLCache<string>

  /**
   * Create a service bound to the provided `impit` client and VQD cache.
   *
   * @param impit Shared HTTP client used for all outbound requests.
   * @param vqdCache Cache holding VQD tokens keyed by query.
   */
  public constructor(impit: Impit, vqdCache: TTLCache<string>) {
    this.impit = impit
    this.vqdCache = vqdCache
  }

  /**
   * Performs a web search on DuckDuckGo.
   *
   * @param parameters Query and pagination parameters for the search.
   * @param options Options controlling the outbound request.
   * @returns The parsed search results along with their count.
   */
  public async searchWeb(parameters: SearchParameters, options: FetchOptions): Promise<SearchCacheEntry> {
    const url = this.buildWebSearchUrl(parameters).toString()
    const response = await this.fetch(url, options)
    const html = await response.text()
    const results = this.parseWebResults(html, parameters.pageSize)

    return {
      results,
      count: results.length,
    }
  }

  /**
   * Retrieves the VQD token required for image searches, using the shared cache
   * when possible and falling back to scraping the DuckDuckGo homepage.
   *
   * @param query Search query whose VQD token is required.
   * @param options Options controlling the outbound request.
   * @returns The cached or freshly scraped VQD token.
   * @throws {VqdTokenError} When the token cannot be located in the response HTML.
   */
  public async getVqdToken(query: string, options: FetchOptions): Promise<string> {
    const cacheKey = `vqd:${query}`
    const cached = await this.vqdCache.get(cacheKey)

    if (cached !== undefined) {
      return cached
    }

    const url = this.buildVqdFetchUrl(query).toString()
    const response = await this.fetch(url, options)
    const html = await response.text()
    const vqd = extractVqdToken(html)

    if (vqd === undefined) {
      throw new VqdTokenError()
    }

    await this.vqdCache.set(cacheKey, vqd)

    return vqd
  }

  /**
   * Performs an image search on DuckDuckGo.
   *
   * @param parameters Query and pagination parameters for the search.
   * @param vqd VQD token previously obtained via `fetchVqdToken`.
   * @param options Options controlling the outbound request.
   * @returns Raw image result entries returned by the DuckDuckGo API.
   */
  public async searchImages(
    parameters: SearchParameters,
    vqd: string,
    options: FetchOptions
  ): Promise<DuckDuckGoImageResult[]> {
    const url = this.buildImageSearchUrl(parameters, vqd).toString()
    const response = await this.fetch(url, options)
    const data = (await response.json()) as ImageSearchResponseBody

    return data.results ?? []
  }

  /**
   * Fetches a URL with error handling.
   *
   * @param url Target URL to request.
   * @param options Options controlling the outbound request.
   * @returns The successful response.
   * @throws {FetchError} When the response carries a non-2xx status.
   */
  private async fetch(url: string, options: FetchOptions): Promise<ReturnType<Impit["fetch"]>> {
    const response = await this.impit.fetch(url, {
      method: "GET",
      signal: options.signal,
    })

    if (!response.ok) {
      throw new FetchError(`HTTP ${response.status}: ${response.statusText}`, response.status)
    }

    return response
  }

  /**
   * Builds the URL for web search.
   *
   * @param parameters Query and pagination parameters for the search.
   * @returns Fully constructed web-search URL.
   */
  private buildWebSearchUrl(parameters: SearchParameters): URL {
    const url = new URL(WEB_SEARCH_PATH, DUCKDUCKGO_BASE_URL)
    url.searchParams.append("q", parameters.query)
    url.searchParams.append("p", this.getSafeSearchParam(parameters.safeSearch))

    if (parameters.page > 1) {
      url.searchParams.append("s", this.calculateOffset(parameters.pageSize, parameters.page).toString())
    }

    return url
  }

  /**
   * Builds the URL for VQD token fetch.
   *
   * @param query Search query associated with the VQD token request.
   * @returns Fully constructed VQD-fetch URL.
   */
  private buildVqdFetchUrl(query: string): URL {
    const url = new URL(VQD_FETCH_PATH, DUCKDUCKGO_BASE_URL)
    url.searchParams.append("q", query)
    url.searchParams.append("iax", "images")
    url.searchParams.append("ia", "images")

    return url
  }

  /**
   * Builds the URL for image search.
   *
   * @param parameters Query and pagination parameters for the search.
   * @param vqd VQD token previously obtained via `fetchVqdToken`.
   * @returns Fully constructed image-search URL.
   */
  private buildImageSearchUrl(parameters: SearchParameters, vqd: string): URL {
    const url = new URL(IMAGE_SEARCH_PATH, DUCKDUCKGO_BASE_URL)
    url.searchParams.append("q", parameters.query)
    url.searchParams.append("o", "json")
    url.searchParams.append("l", "us-en")
    url.searchParams.append("vqd", vqd)
    url.searchParams.append("f", ",,,,,")
    url.searchParams.append("p", this.getSafeSearchParam(parameters.safeSearch))

    if (parameters.page > 1) {
      url.searchParams.append("s", this.calculateOffset(parameters.pageSize, parameters.page).toString())
    }

    return url
  }

  /**
   * Parses web search results from HTML.
   *
   * @param html Raw HTML payload returned by the web-search endpoint.
   * @param maxResults Upper bound on the number of results to return.
   * @returns The parsed search results.
   */
  private parseWebResults(html: string, maxResults: number): SearchCacheEntry["results"] {
    return parseWebSearchResults(html, maxResults)
  }

  /**
   * Gets the safe search parameter value.
   *
   * @param safeSearch Safe-search mode selected by the caller.
   * @returns The DuckDuckGo-specific `p` parameter string for the mode.
   */
  private getSafeSearchParam(safeSearch: SafeSearch): string {
    if (safeSearch === "moderate") {
      return ""
    }

    return safeSearch === "strict" ? "1" : "-1"
  }

  /**
   * Calculates the offset for pagination.
   *
   * @param pageSize Number of results per page.
   * @param page One-based page number.
   * @returns Zero-based offset corresponding to the requested page.
   */
  private calculateOffset(pageSize: number, page: number): number {
    return pageSize * (page - 1)
  }
}
