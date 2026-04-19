/**
 * Tool definitions for DuckDuckGo search functionality
 */

import { tool, Tool, ToolsProviderController } from "@lmstudio/sdk"
import { Impit } from "impit"
import { z } from "zod"

import { TTLCache } from "./cache"
import { resolveConfig } from "./config/config-resolver"
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
import { SearchAbortedError, NoResultsError, VqdTokenError, FetchError, isAbortError, getErrorMessage } from "./errors"
import { extractImageUrls } from "./parsers"
import { DuckDuckGoService } from "./services/duck-duck-go-service"
import { downloadImage } from "./services/image-download-service"
import { RateLimiter } from "./utils/rate-limiter"

import type { SafeSearch } from "./types"

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
    implementation: async ({ query, pageSize: parameterPageSize, safeSearch: parameterSafeSearch, page }, context) => {
      context.status("Initiating DuckDuckGo web search...")
      await rateLimiter.waitIfNeeded()

      try {
        const { pageSize, safeSearch } = resolveConfig(ctl, {
          pageSize: parameterPageSize,
          safeSearch: parameterSafeSearch,
        })

        const cached = getFromCache(cache, "web", query, safeSearch, page)

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

        const cacheEntry = {
          results: result.results.map(({ label, url }) => [label, url] as [string, string]),
          count: result.results.length,
        }

        setInCache(cache, "web", query, safeSearch, page, cacheEntry)

        return cacheEntry.results
      } catch (error) {
        return handleSearchError(error, context)
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
    implementation: async ({ query, pageSize: parameterPageSize, safeSearch: parameterSafeSearch, page }, context) => {
      context.status("Initiating DuckDuckGo image search...")
      await rateLimiter.waitIfNeeded()

      try {
        const { pageSize, safeSearch } = resolveConfig(ctl, {
          pageSize: parameterPageSize,
          safeSearch: parameterSafeSearch,
        })

        const vqd = await getVqdToken(query, service, vqdCache, context.signal)

        if (vqd === undefined) {
          context.warn("Failed to extract vqd token.")
          throw new VqdTokenError()
        }

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
        return handleSearchError(error, context)
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
  context: {
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
    context.warn(`Failed to fetch search results: ${error.message}`)
    return `Error: Failed to fetch search results: ${error.message}`
  }

  const message = getErrorMessage(error)
  context.warn(`Error during search: ${message}`)
  return `Error: ${message}`
}

/**
 * Creates a delay promise
 */
async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
