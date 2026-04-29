/**
 * Web Search tool factory.
 */

import { tool, type Tool, type ToolsProviderController } from "@lmstudio/sdk"
import { z } from "zod"

import { searchCacheKey, type SearchResultsPayload, type TTLCache } from "../cache"
import { resolveConfig } from "../config/resolve-config"
import { searchWeb } from "../duckduckgo"
import { enrichSearchResults, shapeWebSearchResults, type ScrapeEnrichmentMetadata } from "../enrichment"
import { formatToolError, NoWebResultsError } from "../errors"
import { createRetryNotifier } from "../http"

import type { RetryOptions } from "../http"
import type { PerHostRateLimiter, RateLimiter } from "../timing"
import type { FetchedPage } from "../website"
import type { Impit } from "impit"

/**
 * Lower bound on the requested page number.
 *
 * @const {number}
 * @default
 */
const MIN_PAGE_NUMBER = 1

/**
 * Upper bound on the requested page number.
 *
 * @const {number}
 * @default
 */
const MAX_PAGE_NUMBER = 100

/**
 * Default page number when no value is provided.
 *
 * @const {number}
 * @default
 */
const DEFAULT_PAGE_NUMBER = 1

/**
 * Create the Web Search tool.
 *
 * @param ctl Tools provider controller supplied by the LM Studio SDK.
 * @param impit Shared HTTP client used for outbound requests.
 * @param searchCache Cache holding prior web search results.
 * @param websiteCache Cache holding recent fetched pages keyed by URL; reused for per-result enrichment.
 * @param rateLimiter Shared limiter enforcing the minimum gap between outbound requests at the global level (used for the DuckDuckGo search itself).
 * @param hostLimiter Per-host limiter enforcing the minimum gap between requests to the same host; drives the per-result enrichment fan-out so different domains run in parallel.
 * @param scraper Shared metascraper instance used to extract metadata for each result.
 * @param retry Retry policy applied to every outbound request.
 * @returns The configured web search tool.
 */
export function createWebSearchTool(
  ctl: ToolsProviderController,
  impit: Impit,
  searchCache: TTLCache<SearchResultsPayload>,
  websiteCache: TTLCache<FetchedPage>,
  rateLimiter: RateLimiter,
  hostLimiter: PerHostRateLimiter,
  scraper: ScrapeEnrichmentMetadata,
  retry: RetryOptions
): Tool {
  return tool({
    name: "Web Search",
    description:
      "Search for web pages on DuckDuckGo using a query string, returning a list of URLs with titles, snippet previews, and metadata fields (page date, OpenGraph type, description) extracted from each result page.",
    parameters: {
      query: z.string().describe("The search query for finding web pages."),
      page: z
        .number()
        .int()
        .min(MIN_PAGE_NUMBER)
        .max(MAX_PAGE_NUMBER)
        .optional()
        .default(DEFAULT_PAGE_NUMBER)
        .describe("The current page number for pagination."),
    },

    /**
     * Executes a web search, honouring cached results when available and enriching each
     * fresh result with metascraper-extracted metadata before caching the payload.
     *
     * @param arguments_ Validated tool parameters.
     * @param arguments_.query Search query string.
     * @param arguments_.page Page number being requested.
     * @param context Runtime tool context supplied by the SDK.
     * @returns Either the enriched result records or a user-facing error string.
     */
    implementation: async (arguments_, context) => {
      const { query, page } = arguments_
      context.status("Initiating web search...")
      await rateLimiter.wait()

      try {
        const { webMaxResults, webPageStride, safeSearch, includeSnippets, enrichResults, maxResponseBytes } =
          resolveConfig(ctl)
        const cacheKey = searchCacheKey("web", query, safeSearch, page, enrichResults)
        const cached = await searchCache.get(cacheKey)

        if (cached !== undefined) {
          context.status(`Found ${cached.count} web pages (cached).`)

          return { results: shapeWebSearchResults(cached.results, includeSnippets), count: cached.count }
        }

        const parameters = { query, pageStride: webPageStride, safeSearch, page }
        const raw = await searchWeb(impit, parameters, webMaxResults, {
          signal: context.signal,
          retry,
          onFailedAttempt: createRetryNotifier(context.status, "web search"),
        })

        if (raw.results.length === 0) {
          throw new NoWebResultsError(query)
        }

        let { results } = raw

        if (enrichResults) {
          context.status(`Found ${results.length} web pages. Enriching metadata...`)
          results = await enrichSearchResults(results, scraper, impit, websiteCache, hostLimiter, {
            signal: context.signal,
            retry,
            status: context.status,
            maxBytes: maxResponseBytes,
          })
          context.status(`Enriched ${results.length} results.`)
        } else {
          context.status(`Found ${results.length} web pages.`)
        }

        const payload: SearchResultsPayload = { results, count: results.length }
        await searchCache.set(cacheKey, payload)

        return { results: shapeWebSearchResults(results, includeSnippets), count: results.length }
      } catch (error) {
        return formatToolError(error, context, "web-search")
      }
    },
  })
}
