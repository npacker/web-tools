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
 * @default
 */
const MIN_PAGE_SIZE = 1

/**
 * Upper bound on the configurable page size.
 *
 * @const {number}
 * @default
 */
const MAX_PAGE_SIZE = 10

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
    description:
      "Search for web pages on DuckDuckGo using a query string, returning a list of URLs with titles and snippet previews.",
    parameters: {
      query: z.string().describe("The search query for finding web pages."),
      pageSize: z
        .number()
        .int()
        .min(MIN_PAGE_SIZE)
        .max(MAX_PAGE_SIZE)
        .optional()
        .describe("The number of web results per page."),
      safeSearch: z.enum(["strict", "moderate", "off"]).optional().describe("Safe Search."),
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
     * Executes a web search, honouring cached results when available.
     *
     * @param arguments_ Validated tool parameters.
     * @param arguments_.query Search query string.
     * @param arguments_.pageSize Optional per-call page size override.
     * @param arguments_.safeSearch Optional per-call safe-search override.
     * @param arguments_.page Page number being requested.
     * @param context Runtime tool context supplied by the SDK.
     * @returns Either the result tuples or a user-facing error string.
     */
    implementation: async (arguments_, context) => {
      const { query, pageSize: parameterPageSize, safeSearch: parameterSafeSearch, page } = arguments_
      context.status("Initiating web search...")
      await rateLimiter.wait()

      try {
        const { pageSize, safeSearch, includeSnippets } = resolveConfig(ctl, {
          pageSize: parameterPageSize,
          safeSearch: parameterSafeSearch,
        })
        const cacheKey = searchCacheKey("web", query, safeSearch, page)
        const cached = await cache.get(cacheKey)

        if (cached !== undefined) {
          context.status(`Found ${cached.count} web pages (cached).`)

          if (includeSnippets) {
            return { results: cached.results, count: cached.count }
          }

          return {
            results: cached.results.map(([label, url]) => [label, url] as [string, string]),
            count: cached.count,
          }
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

        if (includeSnippets) {
          return { results: result.results, count: result.count }
        }

        return {
          results: result.results.map(([label, url]) => [label, url] as [string, string]),
          count: result.count,
        }
      } catch (error) {
        return formatToolError(error, context, "web-search")
      }
    },
  })
}
