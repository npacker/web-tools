/**
 * DuckDuckGo API service for web and image searches
 */

import { Impit } from "impit"
import { DUCKDUCKGO_BASE_URL, WEB_SEARCH_PATH, IMAGE_SEARCH_PATH, VQD_FETCH_PATH } from "../constants"
import type { SafeSearch, SearchParameters, SearchCacheEntry, DuckDuckGoImageResult } from "../types"
import { extractVqdToken, parseWebSearchResults } from "../parsers"
import { FetchError } from "../errors"

export interface FetchOptions {
  signal: AbortSignal
}

export class DuckDuckGoService {
  private readonly impit: Impit

  public constructor(impit: Impit) {
    this.impit = impit
  }

  /**
   * Performs a web search on DuckDuckGo
   */
  public async searchWeb(params: SearchParameters, options: FetchOptions): Promise<SearchCacheEntry> {
    const url = this.buildWebSearchUrl(params).toString()
    const response = await this.fetch(url, options)
    const html = await response.text()
    const results = this.parseWebResults(html, params.pageSize)

    return {
      results,
      count: results.length,
    }
  }

  /**
   * Fetches the VQD token required for image searches
   */
  public async fetchVqdToken(query: string, options: FetchOptions): Promise<string> {
    const url = this.buildVqdFetchUrl(query).toString()
    const response = await this.fetch(url, options)
    const html = await response.text()
    const vqd = extractVqdToken(html)

    if (vqd === undefined) {
      throw new Error("VQD token not found")
    }

    return vqd
  }

  /**
   * Performs an image search on DuckDuckGo
   */
  public async searchImages(
    params: SearchParameters,
    vqd: string,
    options: FetchOptions
  ): Promise<DuckDuckGoImageResult[]> {
    const url = this.buildImageSearchUrl(params, vqd).toString()
    const response = await this.fetch(url, options)
    const data = (await response.json()) as { results?: DuckDuckGoImageResult[] }

    return data.results ?? []
  }

  /**
   * Fetches a URL with error handling
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
   * Builds the URL for web search
   */
  private buildWebSearchUrl(params: SearchParameters): URL {
    const url = new URL(WEB_SEARCH_PATH, DUCKDUCKGO_BASE_URL)
    url.searchParams.append("q", params.query)
    url.searchParams.append("p", this.getSafeSearchParam(params.safeSearch))

    if (params.page > 1) {
      url.searchParams.append("s", this.calculateOffset(params.pageSize, params.page).toString())
    }

    return url
  }

  /**
   * Builds the URL for VQD token fetch
   */
  private buildVqdFetchUrl(query: string): URL {
    const url = new URL(VQD_FETCH_PATH, DUCKDUCKGO_BASE_URL)
    url.searchParams.append("q", query)
    url.searchParams.append("iax", "images")
    url.searchParams.append("ia", "images")

    return url
  }

  /**
   * Builds the URL for image search
   */
  private buildImageSearchUrl(params: SearchParameters, vqd: string): URL {
    const url = new URL(IMAGE_SEARCH_PATH, DUCKDUCKGO_BASE_URL)
    url.searchParams.append("q", params.query)
    url.searchParams.append("o", "json")
    url.searchParams.append("l", "us-en")
    url.searchParams.append("vqd", vqd)
    url.searchParams.append("f", ",,,,,")
    url.searchParams.append("p", this.getSafeSearchParam(params.safeSearch))

    if (params.page > 1) {
      url.searchParams.append("s", this.calculateOffset(params.pageSize, params.page).toString())
    }

    return url
  }

  /**
   * Parses web search results from HTML
   */
  private parseWebResults(html: string, maxResults: number): SearchCacheEntry["results"] {
    return parseWebSearchResults(html, maxResults)
  }

  /**
   * Gets the safe search parameter value
   */
  private getSafeSearchParam(safeSearch: SafeSearch): string {
    if (safeSearch === "moderate") {
      return ""
    }

    return safeSearch === "strict" ? "1" : "-1"
  }

  /**
   * Calculates the offset for pagination
   */
  private calculateOffset(pageSize: number, page: number): number {
    return pageSize * (page - 1)
  }
}
