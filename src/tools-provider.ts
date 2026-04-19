/**
 * Tool definitions for DuckDuckGo search functionality.
 */

import path from "node:path"

import { tool, Tool, ToolsProviderController } from "@lmstudio/sdk"
import { Impit } from "impit"
import { z } from "zod"

import { TTLCache, searchCacheKey } from "./cache"
import { DEFAULT_PAGE_SIZE, DEFAULT_SAFE_SEARCH, resolveConfig } from "./config/config-resolver"
import { NoResultsError, formatSearchError } from "./errors"
import { extractImageUrls } from "./parsers"
import { DuckDuckGoService } from "./services/duck-duck-go-service"
import { downloadImage } from "./services/image-download-service"
import { RateLimiter, delay } from "./utils"

import type { CachedSearchResults } from "./cache"

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
 * Minimum interval enforced between outbound DuckDuckGo requests, in milliseconds.
 */
const MIN_REQUEST_INTERVAL_MS = 5000
/**
 * Delay inserted between a VQD token fetch and the subsequent image search, in milliseconds.
 */
const IMAGE_FETCH_DELAY_MS = 2000
/**
 * Lower bound on the configurable page size.
 */
const MIN_PAGE_SIZE = 1
/**
 * Upper bound on the configurable page size.
 */
const MAX_PAGE_SIZE = 10
/**
 * Lower bound on the requested page number.
 */
const MIN_PAGE_NUMBER = 1
/**
 * Upper bound on the requested page number.
 */
const MAX_PAGE_NUMBER = 100
/**
 * Default page number when no value is provided.
 */
const DEFAULT_PAGE_NUMBER = 1

/**
 * Creates and configures the DuckDuckGo tools provider.
 *
 * @param ctl Tools provider controller supplied by the LM Studio SDK.
 * @returns The registered web and image search tools.
 */
export async function toolsProvider(ctl: ToolsProviderController): Promise<Tool[]> {
  const impit = new Impit({ browser: "chrome" })
  const rateLimiter = new RateLimiter(MIN_REQUEST_INTERVAL_MS)
  const cacheRoot = path.join(ctl.getWorkingDirectory(), CACHE_DIRECTORY_NAME)
  const vqdCache = new TTLCache<string>(path.join(cacheRoot, VQD_CACHE_SUBDIR), VQD_CACHE_TTL_MS, VQD_CACHE_MAX_SIZE)
  const duckDuckGoService = new DuckDuckGoService(impit, vqdCache)
  const searchCache = new TTLCache<CachedSearchResults>(
    path.join(cacheRoot, SEARCH_CACHE_SUBDIR),
    SEARCH_CACHE_TTL_MS,
    SEARCH_CACHE_MAX_SIZE
  )
  const webSearchTool = createWebSearchTool(ctl, duckDuckGoService, searchCache, rateLimiter)
  const imageSearchTool = createImageSearchTool(ctl, duckDuckGoService, rateLimiter, impit)

  return [webSearchTool, imageSearchTool]
}

/**
 * Creates the web search tool.
 *
 * @param ctl Tools provider controller supplied by the LM Studio SDK.
 * @param service DuckDuckGo service used for outbound requests.
 * @param cache Cache holding prior web search results.
 * @param rateLimiter Shared limiter enforcing the minimum gap between requests.
 * @returns The configured web search tool.
 */
function createWebSearchTool(
  ctl: ToolsProviderController,
  service: DuckDuckGoService,
  cache: TTLCache<CachedSearchResults>,
  rateLimiter: RateLimiter
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
      await rateLimiter.waitIfNeeded()

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
        const result = await service.searchWeb(parameters, { signal: context.signal })

        if (result.results.length === 0) {
          throw new NoResultsError("web")
        }

        context.status(`Found ${result.results.length} web pages.`)
        const cacheEntry: CachedSearchResults = {
          results: result.results.map(({ label, url }) => [label, url] as [string, string]),
          count: result.results.length,
        }
        await cache.set(cacheKey, cacheEntry)

        return cacheEntry.results
      } catch (error) {
        return formatSearchError(error, context)
      }
    },
  })
}

/**
 * Creates the image search tool.
 *
 * @param ctl Tools provider controller supplied by the LM Studio SDK.
 * @param service DuckDuckGo service used for outbound requests.
 * @param rateLimiter Shared limiter enforcing the minimum gap between requests.
 * @param impit Shared HTTP client reused for image downloads.
 * @returns The configured image search tool.
 */
function createImageSearchTool(
  ctl: ToolsProviderController,
  service: DuckDuckGoService,
  rateLimiter: RateLimiter,
  impit: Impit
): Tool {
  return tool({
    name: "Image Search",
    description: "Search for images on DuckDuckGo using a query string and return a list of image URLs.",
    parameters: {
      query: z.string().describe("The search query for finding images"),
      pageSize: z
        .number()
        .int()
        .min(MIN_PAGE_SIZE)
        .max(MAX_PAGE_SIZE)
        .optional()
        .default(DEFAULT_PAGE_SIZE)
        .describe("Number of image results per page"),
      safeSearch: z.enum(["strict", "moderate", "off"]).optional().default(DEFAULT_SAFE_SEARCH).describe("Safe Search"),
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
     * Executes an image search, downloading any matching images to the working directory.
     *
     * @param args Validated tool parameters.
     * @param args.query Search query string.
     * @param args.pageSize Optional per-call page size override.
     * @param args.safeSearch Optional per-call safe-search override.
     * @param args.page Page number being requested.
     * @param context Runtime tool context supplied by the SDK.
     * @returns Either the downloaded file paths, the remote URLs on download failure, or a user-facing error string.
     */
    implementation: async ({ query, pageSize: parameterPageSize, safeSearch: parameterSafeSearch, page }, context) => {
      context.status("Initiating DuckDuckGo image search...")
      await rateLimiter.waitIfNeeded()

      try {
        const { pageSize, safeSearch } = resolveConfig(ctl, {
          pageSize: parameterPageSize,
          safeSearch: parameterSafeSearch,
        })
        const vqd = await service.getVqdToken(query, { signal: context.signal })
        await delay(IMAGE_FETCH_DELAY_MS)
        const parameters = { query, pageSize, safeSearch, page }
        const imageResults = await service.searchImages(parameters, vqd, {
          signal: context.signal,
        })
        const imageUrls = extractImageUrls(imageResults, pageSize)

        if (imageUrls.length === 0) {
          throw new NoResultsError("image")
        }

        context.status(`Found ${imageUrls.length} images. Fetching...`)
        const workingDirectory = ctl.getWorkingDirectory()
        const timestamp = Date.now()
        const downloadPromises = imageUrls.map(async (url, index) =>
          downloadImage(
            url,
            impit,
            {
              workingDirectory,
              timestamp,
              index: index + 1,
            },
            {
              warn: context.warn,
              signal: context.signal,
            }
          )
        )
        const settled = await Promise.all(downloadPromises)
        const downloadedPaths = settled.filter(
          (downloadedPath): downloadedPath is string => downloadedPath !== undefined
        )

        if (downloadedPaths.length === 0) {
          context.warn("Error fetching images")

          return imageUrls
        }

        context.status(`Downloaded ${downloadedPaths.length} images successfully.`)

        return downloadedPaths
      } catch (error) {
        return formatSearchError(error, context)
      }
    },
  })
}
