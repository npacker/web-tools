/**
 * Web Search tool factory.
 */

import { tool, type Tool, type ToolsProviderController } from "@lmstudio/sdk"
import { z } from "zod"

import { type TTLCache, searchCacheKey, type SearchResultsPayload } from "../cache"
import { resolveConfig } from "../config/resolve-config"
import { searchWeb } from "../duckduckgo"
import { formatToolError, NoWebResultsError } from "../errors"
import { createRetryNotifier } from "../http"

import type { RetryOptions } from "../http"
import type { RateLimiter } from "../timing"
import type { Impit } from "impit"

/**
 * Lower bound on the configurable page size.
 *
 * @const {number}
 * @default 1
 */
const MIN_PAGE_SIZE = 1

/**
 * Upper bound on the configurable page size.
 *
 * @const {number}
 * @default 10
 */
const MAX_PAGE_SIZE = 10

/**
 * Lower bound on the requested page number.
 *
 * @const {number}
 * @default 1
 */
const MIN_PAGE_NUMBER = 1

/**
 * Upper bound on the requested page number.
 *
 * @const {number}
 * @default 100
 */
const MAX_PAGE_NUMBER = 100

/**
 * Default page number when no value is provided.
 *
 * @const {number}
 * @default 1
 */
const DEFAULT_PAGE_NUMBER = 1

/**
 * Create the Web Search tool.
 *
 * @param ctl Tools provider controller supplied by the LM Studio SDK.
 * @param impit Shared HTTP client used for outbound requests.
 * @param cache Cache holding prior web search results.
 * @param rateLimiter Shared limiter enforcing the minimum gap between requests.
 * @param retry Retry policy applied to every outbound request.
 * @returns The configured web search tool.
 */
export function createWebSearchTool(
  ctl: ToolsProviderController,
  impit: Impit,
  cache: TTLCache<SearchResultsPayload>,
  rateLimiter: RateLimiter,
  retry: RetryOptions
): Tool {
  return tool({
    name: "Web Search",
    description: "Search for web pages on DuckDuckGo using a query string, returning a list of URLs.",
    parameters: {
      query: z.string().describe("The search query for finding web pages"),
      pageSize: z
        .number()
        .int()
        .min(MIN_PAGE_SIZE)
        .max(MAX_PAGE_SIZE)
        .optional()
        .describe("Number of web results per page"),
      safeSearch: z.enum(["strict", "moderate", "off"]).optional().describe("Safe Search"),
      page: z
        .number()
        .int()
        .min(MIN_PAGE_NUMBER)
        .max(MAX_PAGE_NUMBER)
        .optional()
        .default(DEFAULT_PAGE_NUMBER)
        .describe("Page number for pagination"),
    },

    /**
     * Executes a web search, honouring cached results when available.
     *
     * @param args Validated tool parameters.
     * @param args.query Search query string.
     * @param args.pageSize Optional per-call page size override.
     * @param args.safeSearch Optional per-call safe-search override.
     * @param args.page Page number being requested.
     * @param context Runtime tool context supplied by the SDK.
     * @returns Either the result tuples or a user-facing error string.
     */
    implementation: async ({ query, pageSize: parameterPageSize, safeSearch: parameterSafeSearch, page }, context) => {
      context.status("Initiating DuckDuckGo web search...")
      await rateLimiter.wait()

      try {
        const { pageSize, safeSearch } = resolveConfig(ctl, {
          pageSize: parameterPageSize,
          safeSearch: parameterSafeSearch,
        })
        const cacheKey = searchCacheKey("web", query, safeSearch, page)
        const cached = await cache.get(cacheKey)

        if (cached !== undefined) {
          context.status(`Found ${cached.count} web pages (cached).`)

          return cached.results
        }

        const parameters = { query, pageSize, safeSearch, page }
        const result = await searchWeb(impit, parameters, {
          signal: context.signal,
          retry,
          onFailedAttempt: createRetryNotifier(context.status, "web search"),
        })

        if (result.results.length === 0) {
          throw new NoWebResultsError(query)
        }

        context.status(`Found ${result.results.length} web pages.`)
        await cache.set(cacheKey, result)

        return result.results
      } catch (error) {
        return formatToolError(error, context, "web-search")
      }
    },
  })
}
