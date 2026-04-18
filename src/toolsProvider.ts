/**
 * Tool definitions for DuckDuckGo search functionality
 */

import { tool, Tool, ToolsProviderController } from "@lmstudio/sdk"
import { z } from "zod"
import { Impit } from "impit"
import {
  SEARCH_CACHE_TTL_MS,
  SEARCH_CACHE_MAX_SIZE,
  VQD_CACHE_TTL_MS,
  VQD_CACHE_MAX_SIZE,
  MIN_REQUEST_INTERVAL_MS,
  IMAGE_FETCH_DELAY_MS,
  MIN_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MAX_PAGE_NUMBER,
  MIN_PAGE_NUMBER,
  DEFAULT_PAGE_NUMBER,
  DEFAULT_PAGE_SIZE,
  DEFAULT_SAFE_SEARCH,
} from "./constants"
import type { SafeSearch } from "./types"
import { TTLCache } from "./cache"
import { RateLimiter } from "./utils/RateLimiter"
import { DuckDuckGoService } from "./services/DuckDuckGoService"
import { extractImageUrls } from "./parsers"
import { downloadImage } from "./services/ImageDownloadService"
import { resolveConfig } from "./config/configResolver"
import { SearchAbortedError, NoResultsError, VqdTokenError, FetchError, isAbortError, getErrorMessage } from "./errors"

/**
 * Creates and configures the DuckDuckGo tools provider
 */
export async function toolsProvider(ctl: ToolsProviderController): Promise<Tool[]> {
  const impit = new Impit({ browser: "chrome" })
  const rateLimiter = new RateLimiter(MIN_REQUEST_INTERVAL_MS)
  const duckDuckGoService = new DuckDuckGoService(impit)

  const searchCache = new TTLCache<SearchCacheEntry>(SEARCH_CACHE_TTL_MS, SEARCH_CACHE_MAX_SIZE)
  const vqdCache = new TTLCache<string>(VQD_CACHE_TTL_MS, VQD_CACHE_MAX_SIZE)

  const webSearchTool = createWebSearchTool(ctl, duckDuckGoService, searchCache, rateLimiter)

  const imageSearchTool = createImageSearchTool(ctl, duckDuckGoService, vqdCache, rateLimiter, impit)

  return [webSearchTool, imageSearchTool]
}

/**
 * Cache entry for search results
 */
interface SearchCacheEntry {
  results: Array<[string, string]>
  count: number
}

/**
 * Creates the web search tool
 */
function createWebSearchTool(
  ctl: ToolsProviderController,
  service: DuckDuckGoService,
  cache: TTLCache<SearchCacheEntry>,
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
    implementation: async ({ query, pageSize: paramPageSize, safeSearch: paramSafeSearch, page }, ctx) => {
      ctx.status("Initiating DuckDuckGo web search...")
      await rateLimiter.waitIfNeeded()

      try {
        const { pageSize, safeSearch } = resolveConfig(ctl, {
          pageSize: paramPageSize,
          safeSearch: paramSafeSearch,
        })

        const cached = getFromCache(cache, "web", query, safeSearch, page)

        if (cached !== undefined) {
          ctx.status(`Found ${cached.count} web pages (cached).`)
          return cached.results
        }

        const params = { query, pageSize, safeSearch, page }
        const result = await service.searchWeb(params, { signal: ctx.signal })

        if (result.results.length === 0) {
          throw new NoResultsError("web")
        }

        ctx.status(`Found ${result.results.length} web pages.`)

        const cacheEntry = {
          results: result.results.map(({ label, url }) => [label, url] as [string, string]),
          count: result.results.length,
        }

        setInCache(cache, "web", query, safeSearch, page, cacheEntry)

        return cacheEntry.results
      } catch (error) {
        return handleSearchError(error, ctx)
      }
    },
  })
}

/**
 * Creates the image search tool
 */
function createImageSearchTool(
  ctl: ToolsProviderController,
  service: DuckDuckGoService,
  vqdCache: TTLCache<string>,
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
    implementation: async ({ query, pageSize: paramPageSize, safeSearch: paramSafeSearch, page }, ctx) => {
      ctx.status("Initiating DuckDuckGo image search...")
      await rateLimiter.waitIfNeeded()

      try {
        const { pageSize, safeSearch } = resolveConfig(ctl, {
          pageSize: paramPageSize,
          safeSearch: paramSafeSearch,
        })

        const vqd = await getVqdToken(query, service, vqdCache, ctx.signal)

        if (vqd === undefined) {
          ctx.warn("Failed to extract vqd token.")
          throw new VqdTokenError()
        }

        await delay(IMAGE_FETCH_DELAY_MS)

        const params = { query, pageSize, safeSearch, page }
        const imageResults = await service.searchImages(params, vqd, {
          signal: ctx.signal,
        })

        const imageUrls = extractImageUrls(imageResults, pageSize)

        if (imageUrls.length === 0) {
          throw new NoResultsError("image")
        }

        ctx.status(`Found ${imageUrls.length} images. Fetching...`)

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
              warn: ctx.warn,
              signal: ctx.signal,
            }
          )
        )

        const downloadedPaths = (await Promise.all(downloadPromises)).filter((path): path is string => path !== null)

        if (downloadedPaths.length === 0) {
          ctx.warn("Error fetching images")
          return imageUrls
        }

        ctx.status(`Downloaded ${downloadedPaths.length} images successfully.`)

        return downloadedPaths
      } catch (error) {
        return handleSearchError(error, ctx)
      }
    },
  })
}

/**
 * Retrieves VQD token from cache or fetches it
 */
async function getVqdToken(
  query: string,
  service: DuckDuckGoService,
  cache: TTLCache<string>,
  signal: AbortSignal
): Promise<string | undefined> {
  const cacheKey = `vqd:${query}`
  const cached = cache.get(cacheKey)

  if (cached !== undefined) {
    return cached
  }

  try {
    const vqd = await service.fetchVqdToken(query, { signal })
    cache.set(cacheKey, vqd)
    return vqd
  } catch {
    return undefined
  }
}

/**
 * Retrieves search results from cache
 */
function getFromCache(
  cache: TTLCache<SearchCacheEntry>,
  type: "web" | "image",
  query: string,
  safeSearch: SafeSearch,
  page: number
): SearchCacheEntry | undefined {
  const cacheKey = `${type}:${query}:${safeSearch}:${page}`

  return cache.get(cacheKey)
}

/**
 * Stores search results in cache
 */
function setInCache(
  cache: TTLCache<SearchCacheEntry>,
  type: "web" | "image",
  query: string,
  safeSearch: SafeSearch,
  page: number,
  entry: SearchCacheEntry
): void {
  const cacheKey = `${type}:${query}:${safeSearch}:${page}`
  cache.set(cacheKey, entry)
}

/**
 * Handles search errors and returns appropriate response
 */
function handleSearchError(
  error: unknown,
  ctx: {
    warn: (message: string) => void
  }
): string | string[] {
  if (isAbortError(error)) {
    return "Search aborted by user."
  }

  if (error instanceof SearchAbortedError) {
    return error.message
  }

  if (error instanceof NoResultsError) {
    return error.message
  }

  if (error instanceof VqdTokenError) {
    return `Error: ${error.message}`
  }

  if (error instanceof FetchError) {
    ctx.warn(`Failed to fetch search results: ${error.message}`)
    return `Error: Failed to fetch search results: ${error.message}`
  }

  const message = getErrorMessage(error)
  ctx.warn(`Error during search: ${message}`)
  return `Error: ${message}`
}

/**
 * Creates a delay promise
 */
async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
