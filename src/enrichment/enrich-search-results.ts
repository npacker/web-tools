/**
 * Enrich a list of web search results with metadata extracted via metascraper. Each result's
 * destination URL is fetched through the shared website cache + rate limiter, the HTML is
 * passed to the scraper, and the resulting `EnrichmentMetadata` is merged onto the base
 * record. Non-HTML pages (PDF, plain text, JSON) yield no metadata since metascraper rules
 * only fire against parsed HTML; per-URL failures are silently demoted to an unenriched
 * record since enrichment is best-effort and not critical to the search itself.
 */

import { isAbortError } from "../errors"
import { createRetryNotifier } from "../http"
import { normalizeText } from "../text"
import { fetchWebsite } from "../website"

import type { TTLCache, WebSearchResult } from "../cache"
import type { ScrapeEnrichmentMetadata } from "./create-metascraper"
import type { RetryOptions } from "../http"
import type { PerHostRateLimiter } from "../timing"
import type { FetchedPage } from "../website"
import type { Impit } from "impit"

/**
 * Per-call options shared across the enrichment fan-out: cancellation, retry policy, status
 * line for retry notifications, and the byte cap applied to each fetched page.
 */
export interface EnrichSearchResultsOptions {
  /** Signal used to abort the entire enrichment fan-out. */
  signal: AbortSignal
  /** Retry policy applied to each per-result page fetch. */
  retry: RetryOptions
  /** Status-line callback used to surface retry notifications. */
  status: (message: string) => void
  /** Hard upper bound on the HTML payload fetched for each result, in bytes. */
  maxBytes: number
}

/**
 * Enrich every result in `results` with metascraper metadata, fanning out concurrently. The
 * per-host rate limiter serialises calls targeting the same host so a single domain is
 * never hammered, while results pointing at distinct hosts run in parallel; cache hits skip
 * the limiter entirely so warm queries re-resolve quickly.
 *
 * @param results Base search results to enrich.
 * @param scraper Shared metascraper instance used to extract metadata from each fetched page.
 * @param impit Shared HTTP client used for outbound requests.
 * @param websiteCache Cache holding recent fetched pages keyed by URL; reused across tools.
 * @param hostLimiter Per-host limiter enforcing the minimum gap between requests to the same host.
 * @param options Cancellation, retry, status, and byte-cap controls for the fan-out.
 * @returns The input list with metadata merged onto each record.
 * @throws {DOMException} When `options.signal` aborts mid-fan-out — re-thrown so the caller can surface a uniform abort message.
 */
export async function enrichSearchResults(
  results: WebSearchResult[],
  scraper: ScrapeEnrichmentMetadata,
  impit: Impit,
  websiteCache: TTLCache<FetchedPage>,
  hostLimiter: PerHostRateLimiter,
  options: EnrichSearchResultsOptions
): Promise<WebSearchResult[]> {
  const tasks = results.map(async result => enrichOne(result, scraper, impit, websiteCache, hostLimiter, options))

  return Promise.all(tasks)
}

/**
 * Resolve metadata for a single result. Cache hits short-circuit the rate limiter; non-HTML
 * pages produce no metadata; abort errors propagate so the caller can fail fast; every other
 * error is silently demoted to an unenriched record since enrichment is best-effort. The
 * extracted `description` is dropped when it normalizes to the same text as the DDG snippet
 * (which the parser already normalized) so the model is not handed two near-identical fields
 * per result.
 *
 * @param result Base result being enriched.
 * @param scraper Shared metascraper instance used to extract metadata.
 * @param impit Shared HTTP client used for outbound requests.
 * @param websiteCache Cache holding recent fetched pages keyed by URL.
 * @param hostLimiter Per-host limiter enforcing the minimum gap between requests to the same host.
 * @param options Per-call options governing cancellation, retry, and status reporting.
 * @returns The result with any extracted metadata merged in.
 * @throws {DOMException} When `options.signal` aborts during the underlying page fetch.
 */
async function enrichOne(
  result: WebSearchResult,
  scraper: ScrapeEnrichmentMetadata,
  impit: Impit,
  websiteCache: TTLCache<FetchedPage>,
  hostLimiter: PerHostRateLimiter,
  options: EnrichSearchResultsOptions
): Promise<WebSearchResult> {
  try {
    const cached = await websiteCache.get(result.url)

    if (cached === undefined) {
      await hostLimiter.wait(result.url)
    }

    const page = await fetchWebsite(impit, websiteCache, result.url, {
      signal: options.signal,
      retry: options.retry,
      onFailedAttempt: createRetryNotifier(options.status, "result enrichment"),
      maxBytes: options.maxBytes,
    })

    if (page.kind !== "html") {
      return result
    }

    const metadata = await scraper({ html: page.html, url: result.url })
    const enriched: WebSearchResult = { ...result, ...metadata }

    if (
      enriched.description !== undefined &&
      enriched.snippet !== undefined &&
      normalizeText(enriched.description) === enriched.snippet
    ) {
      delete enriched.description
    }

    return enriched
  } catch (error) {
    if (isAbortError(error)) {
      throw error
    }

    return result
  }
}
