/**
 * Wires shared caches, HTTP client, and rate limiter, then registers the four plugin tools
 * with the LM Studio SDK.
 */

import path from "node:path"

import { TTLCache } from "./cache"
import { resolveTimingConfig } from "./config/resolve-config"
import { createMetascraper } from "./enrichment"
import { findLMStudioHome } from "./fs"
import { createImpit } from "./http"
import { PerHostRateLimiter, RateLimiter } from "./timing"
import { createImageSearchTool } from "./tools/image-search-tool"
import { createViewImagesTool } from "./tools/view-images-tool"
import { createVisitWebsiteTool } from "./tools/visit-website-tool"
import { createWebSearchTool } from "./tools/web-search-tool"

import type { SearchResultsPayload } from "./cache"
import type { FetchedPage } from "./website"
import type { Tool, ToolsProviderController } from "@lmstudio/sdk"

/**
 * Root directory name used for the plugin's on-disk `cacache` store.
 *
 * @const {string}
 * @default
 */
const CACHE_DIRECTORY_NAME = "lms-plugin-duckduckgo-cache"

/**
 * Subdirectory under the cache root dedicated to web/image search results. Bumped from
 * `search` when the cached payload shape gained per-result enrichment metadata; old entries
 * under the legacy directory are orphaned and may be deleted by hand.
 *
 * @const {string}
 * @default
 */
const SEARCH_CACHE_SUBDIR = "search-enriched"

/**
 * Maximum number of search result entries retained in the search cache.
 *
 * @const {number}
 * @default
 */
const SEARCH_CACHE_MAX_SIZE = 100

/**
 * Subdirectory under the cache root dedicated to VQD tokens.
 *
 * @const {string}
 * @default
 */
const VQD_CACHE_SUBDIR = "vqd"

/**
 * Maximum number of VQD tokens retained in the VQD cache.
 *
 * @const {number}
 * @default
 */
const VQD_CACHE_MAX_SIZE = 50

/**
 * Subdirectory under the cache root dedicated to fetched website HTML payloads.
 *
 * @const {string}
 * @default
 */
const WEBSITE_CACHE_SUBDIR = "website"

/**
 * Maximum number of website HTML payloads retained in the website cache.
 *
 * @const {number}
 * @default
 */
const WEBSITE_CACHE_MAX_SIZE = 50

/**
 * Maximum number of concurrent image downloads permitted across the plugin. Caps the fan-out
 * driven by a page with many `<img>` tags so a single tool invocation cannot open hundreds
 * of parallel connections against a target.
 *
 * @const {number}
 * @default
 */
const MAX_IMAGE_CONCURRENCY = 6

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
  const rateLimiter = new RateLimiter({ minIntervalMs: timing.requestIntervalMs })
  const hostLimiter = new PerHostRateLimiter({ minIntervalMs: timing.requestIntervalMs })
  const imageLimiter = new RateLimiter({ maxConcurrent: MAX_IMAGE_CONCURRENCY })
  const vqdCache = new TTLCache<string>(
    path.join(cacheRoot, VQD_CACHE_SUBDIR),
    timing.imageSearchTokenCacheTtlMs,
    VQD_CACHE_MAX_SIZE
  )
  const searchCache = new TTLCache<SearchResultsPayload>(
    path.join(cacheRoot, SEARCH_CACHE_SUBDIR),
    timing.searchCacheTtlMs,
    SEARCH_CACHE_MAX_SIZE
  )
  const websiteCache = new TTLCache<FetchedPage>(
    path.join(cacheRoot, WEBSITE_CACHE_SUBDIR),
    timing.websiteCacheTtlMs,
    WEBSITE_CACHE_MAX_SIZE
  )
  const scraper = createMetascraper()
  const retry = timing.retryPolicy

  return [
    createWebSearchTool(ctl, impit, searchCache, websiteCache, rateLimiter, hostLimiter, scraper, retry),
    createImageSearchTool(ctl, impit, vqdCache, rateLimiter, imageLimiter, retry),
    createVisitWebsiteTool(ctl, impit, websiteCache, rateLimiter, retry),
    createViewImagesTool(ctl, impit, websiteCache, rateLimiter, imageLimiter, retry),
  ]
}
