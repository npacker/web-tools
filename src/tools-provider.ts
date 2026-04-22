/**
 * Wires shared caches, HTTP client, and rate limiter, then registers the four plugin tools
 * with the LM Studio SDK.
 */

import path from "node:path"

import { TTLCache } from "./cache"
import { resolveTimingConfig } from "./config/resolve-config"
import { findLMStudioHome } from "./fs"
import { createImpit } from "./http"
import { RateLimiter } from "./timing"
import { createImageSearchTool } from "./tools/image-search-tool"
import { createViewImagesTool } from "./tools/view-images-tool"
import { createVisitWebsiteTool } from "./tools/visit-website-tool"
import { createWebSearchTool } from "./tools/web-search-tool"

import type { SearchResultsPayload } from "./cache"
import type { Tool, ToolsProviderController } from "@lmstudio/sdk"

/**
 * Root directory name used for the plugin's on-disk `cacache` store.
 *
 * @const {string}
 * @default "lms-plugin-duckduckgo-cache"
 */
const CACHE_DIRECTORY_NAME = "lms-plugin-duckduckgo-cache"

/**
 * Subdirectory under the cache root dedicated to web/image search results.
 *
 * @const {string}
 * @default "search"
 */
const SEARCH_CACHE_SUBDIR = "search"

/**
 * Maximum number of search result entries retained in the search cache.
 *
 * @const {number}
 * @default 100
 */
const SEARCH_CACHE_MAX_SIZE = 100

/**
 * Subdirectory under the cache root dedicated to VQD tokens.
 *
 * @const {string}
 * @default "vqd"
 */
const VQD_CACHE_SUBDIR = "vqd"

/**
 * Maximum number of VQD tokens retained in the VQD cache.
 *
 * @const {number}
 * @default 50
 */
const VQD_CACHE_MAX_SIZE = 50

/**
 * Subdirectory under the cache root dedicated to fetched website HTML payloads.
 *
 * @const {string}
 * @default "website"
 */
const WEBSITE_CACHE_SUBDIR = "website"

/**
 * Maximum number of website HTML payloads retained in the website cache.
 *
 * @const {number}
 * @default 50
 */
const WEBSITE_CACHE_MAX_SIZE = 50

/**
 * Register the plugin's four tools with the LM Studio SDK controller.
 *
 * The rate limiter is constructed per-session (rather than module-scoped) so user-configured
 * intervals from plugin settings take effect on plugin reload.
 *
 * @param ctl Tools provider controller supplied by the LM Studio SDK.
 * @returns The registered Web Search, Image Search, Visit Website, and View Images tools.
 */
export async function toolsProvider(ctl: ToolsProviderController): Promise<Tool[]> {
  const timing = resolveTimingConfig(ctl)
  const impit = createImpit()
  const cacheRoot = path.join(findLMStudioHome(), "plugin-data", CACHE_DIRECTORY_NAME)
  const rateLimiter = new RateLimiter(timing.requestIntervalMs)
  const vqdCache = new TTLCache<string>(
    path.join(cacheRoot, VQD_CACHE_SUBDIR),
    timing.vqdCacheTtlMs,
    VQD_CACHE_MAX_SIZE
  )
  const searchCache = new TTLCache<SearchResultsPayload>(
    path.join(cacheRoot, SEARCH_CACHE_SUBDIR),
    timing.searchCacheTtlMs,
    SEARCH_CACHE_MAX_SIZE
  )
  const websiteCache = new TTLCache<string>(
    path.join(cacheRoot, WEBSITE_CACHE_SUBDIR),
    timing.websiteCacheTtlMs,
    WEBSITE_CACHE_MAX_SIZE
  )
  const retry = timing.retryPolicy

  return [
    createWebSearchTool(ctl, impit, searchCache, rateLimiter, retry),
    createImageSearchTool(ctl, impit, vqdCache, rateLimiter, retry),
    createVisitWebsiteTool(ctl, impit, websiteCache, rateLimiter, retry),
    createViewImagesTool(ctl, impit, websiteCache, rateLimiter, retry),
  ]
}
