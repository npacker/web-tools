/**
 * Service that fetches arbitrary web pages via the shared `impit` client.
 */

import { Impit } from "impit"

import { TTLCache } from "../cache"
import { FetchError } from "../errors"

/**
 * Options controlling an outbound website fetch.
 */
export interface WebsiteFetchOptions {
  /** Signal used to abort the in-flight request. */
  signal: AbortSignal
}
/**
 * Fetches HTML content for arbitrary URLs with on-disk TTL caching keyed by URL.
 */
export class WebsiteFetchService {
  /** Shared HTTP client configured with browser-like TLS and header fingerprints. */
  private readonly impit: Impit
  /** Cache holding recent HTML payloads keyed by URL. */
  private readonly cache: TTLCache<string>

  /**
   * Create a service bound to the provided `impit` client and HTML cache.
   *
   * @param impit Shared HTTP client used for all outbound requests.
   * @param cache Cache holding recent HTML payloads keyed by URL.
   */
  public constructor(impit: Impit, cache: TTLCache<string>) {
    this.impit = impit
    this.cache = cache
  }

  /**
   * Fetch the HTML at the given URL, returning a cached payload when one is available.
   *
   * @param url Target URL to fetch.
   * @param options Options controlling the outbound request.
   * @returns The response body as a UTF-8 string.
   * @throws {FetchError} When the response carries a non-2xx status.
   */
  public async fetchHtml(url: string, options: WebsiteFetchOptions): Promise<string> {
    const cached = await this.cache.get(url)

    if (cached !== undefined) {
      return cached
    }

    const response = await this.impit.fetch(url, {
      method: "GET",
      signal: options.signal,
    })

    if (!response.ok) {
      throw new FetchError(`HTTP ${response.status}: ${response.statusText}`, response.status)
    }

    const html = await response.text()
    await this.cache.set(url, html)

    return html
  }
}
