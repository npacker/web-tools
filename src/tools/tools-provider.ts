/**
 * Wires shared caches, HTTP client, and rate limiter, then registers the four plugin tools
 * with the LM Studio SDK.
 */

import path from "node:path"

import { Tool, ToolsProviderController } from "@lmstudio/sdk"

import { TTLCache } from "../cache"
import { createImpit } from "../http"
import { RateLimiter } from "../timing"

import { createImageSearchTool } from "./image-search-tool"
import { createViewImagesTool } from "./view-images-tool"
import { createVisitWebsiteTool } from "./visit-website-tool"
import { createWebSearchTool } from "./web-search-tool"

import type { SearchResultsPayload } from "../cache"

/**
 * Root directory name used for the plugin's on-disk `cacache` store.
 */
const CACHE_DIRECTORY_NAME = "lms-plugin-duckduckgo-cache"
/**
 * Subdirectory under the cache root dedicated to web/image search results.
 */
const SEARCH_CACHE_SUBDIR = "search"
/**
 * Time-to-live for cached web search results, in milliseconds.
 */
const SEARCH_CACHE_TTL_MS = 15 * 60_000
/**
 * Maximum number of search result entries retained in the search cache.
 */
const SEARCH_CACHE_MAX_SIZE = 100
/**
 * Subdirectory under the cache root dedicated to VQD tokens.
 */
const VQD_CACHE_SUBDIR = "vqd"
/**
 * Time-to-live for cached VQD tokens, in milliseconds.
 */
const VQD_CACHE_TTL_MS = 10 * 60_000
/**
 * Maximum number of VQD tokens retained in the VQD cache.
 */
const VQD_CACHE_MAX_SIZE = 50
/**
 * Subdirectory under the cache root dedicated to fetched website HTML payloads.
 */
const WEBSITE_CACHE_SUBDIR = "website"
/**
 * Time-to-live for cached website HTML payloads, in milliseconds.
 */
const WEBSITE_CACHE_TTL_MS = 10 * 60_000
/**
 * Maximum number of website HTML payloads retained in the website cache.
 */
const WEBSITE_CACHE_MAX_SIZE = 50
/**
 * Minimum interval enforced between outbound DuckDuckGo requests, in milliseconds.
 */
const MIN_REQUEST_INTERVAL_MS = 5000
/**
 * Module-scoped rate limiter shared across every tools-provider session. The LM Studio SDK invokes
 * `toolsProvider` once per session, so holding this at module scope is what makes the minimum
 * interval apply across concurrent chats within the same plugin process.
 */
const sharedRateLimiter = new RateLimiter(MIN_REQUEST_INTERVAL_MS)

/**
 * Register the plugin's four tools with the LM Studio SDK controller.
 *
 * @param ctl Tools provider controller supplied by the LM Studio SDK.
 * @returns The registered Web Search, Image Search, Visit Website, and View Images tools.
 */
export async function toolsProvider(ctl: ToolsProviderController): Promise<Tool[]> {
  const impit = createImpit()
  const cacheRoot = path.join(ctl.getWorkingDirectory(), CACHE_DIRECTORY_NAME)
  const vqdCache = new TTLCache<string>(path.join(cacheRoot, VQD_CACHE_SUBDIR), VQD_CACHE_TTL_MS, VQD_CACHE_MAX_SIZE)
  const searchCache = new TTLCache<SearchResultsPayload>(
    path.join(cacheRoot, SEARCH_CACHE_SUBDIR),
    SEARCH_CACHE_TTL_MS,
    SEARCH_CACHE_MAX_SIZE
  )
  const websiteCache = new TTLCache<string>(
    path.join(cacheRoot, WEBSITE_CACHE_SUBDIR),
    WEBSITE_CACHE_TTL_MS,
    WEBSITE_CACHE_MAX_SIZE
  )

  return [
    createWebSearchTool(ctl, impit, searchCache, sharedRateLimiter),
    createImageSearchTool(ctl, impit, vqdCache, sharedRateLimiter),
    createVisitWebsiteTool(ctl, impit, websiteCache, sharedRateLimiter),
    createViewImagesTool(ctl, impit, websiteCache, sharedRateLimiter),
  ]
}
