/**
 * Tool definitions for DuckDuckGo search functionality.
 */

import path from "node:path"

import { tool, Tool, ToolsProviderController } from "@lmstudio/sdk"
import { Impit } from "impit"
import { z } from "zod"

import { TTLCache, searchCacheKey } from "./cache"
import { DEFAULT_PAGE_SIZE, DEFAULT_SAFE_SEARCH, resolveConfig } from "./config/config-resolver"
import { NoResultsError, formatSearchError, formatToolError } from "./errors"
import {
  buildPageContent,
  extractHeadings,
  extractImageUrls,
  extractLinks,
  extractPageImages,
  parseWebsiteDocument,
} from "./parsers"
import { DuckDuckGoService } from "./services/duck-duck-go-service"
import { downloadImageBatch, extractAndDownloadPageImages } from "./services/image-batch-service"
import { WebsiteFetchService } from "./services/website-fetch-service"
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
 * Lower bound on the extraction counts exposed by the Visit Website tool.
 */
const MIN_EXTRACTION_COUNT = 0
/**
 * Upper bound on the extraction counts exposed by the Visit Website and View Images tools.
 */
const MAX_EXTRACTION_COUNT = 200
/**
 * Lower bound on the image count requested by the View Images tool.
 */
const MIN_VIEW_IMAGES_COUNT = 1
/**
 * Lower bound on the visible-text character budget exposed by the Visit Website tool.
 */
const MIN_CONTENT_LIMIT = 0
/**
 * Upper bound on the visible-text character budget exposed by the Visit Website tool.
 */
const MAX_CONTENT_LIMIT = 10_000
/**
 * User-facing warning used when a batch of image downloads yields no files.
 */
const IMAGE_FETCH_FAILURE_MESSAGE = "Error fetching images"
/**
 * Module-scoped rate limiter shared across every tools-provider session. The LM Studio SDK invokes
 * `toolsProvider` once per session, so holding this at module scope is what makes the minimum
 * interval apply across concurrent chats within the same plugin process.
 */
const sharedRateLimiter = new RateLimiter(MIN_REQUEST_INTERVAL_MS)

/**
 * Creates and configures the DuckDuckGo tools provider.
 *
 * @param ctl Tools provider controller supplied by the LM Studio SDK.
 * @returns The registered web search, image search, visit website, and view images tools.
 */
export async function toolsProvider(ctl: ToolsProviderController): Promise<Tool[]> {
  const impit = new Impit({ browser: "chrome" })
  const cacheRoot = path.join(ctl.getWorkingDirectory(), CACHE_DIRECTORY_NAME)
  const vqdCache = new TTLCache<string>(path.join(cacheRoot, VQD_CACHE_SUBDIR), VQD_CACHE_TTL_MS, VQD_CACHE_MAX_SIZE)
  const duckDuckGoService = new DuckDuckGoService(impit, vqdCache)
  const searchCache = new TTLCache<CachedSearchResults>(
    path.join(cacheRoot, SEARCH_CACHE_SUBDIR),
    SEARCH_CACHE_TTL_MS,
    SEARCH_CACHE_MAX_SIZE
  )
  const websiteCache = new TTLCache<string>(
    path.join(cacheRoot, WEBSITE_CACHE_SUBDIR),
    WEBSITE_CACHE_TTL_MS,
    WEBSITE_CACHE_MAX_SIZE
  )
  const websiteFetch = new WebsiteFetchService(impit, websiteCache)
  const webSearchTool = createWebSearchTool(ctl, duckDuckGoService, searchCache, sharedRateLimiter)
  const imageSearchTool = createImageSearchTool(ctl, duckDuckGoService, sharedRateLimiter, impit)
  const visitWebsiteTool = createVisitWebsiteTool(ctl, websiteFetch, impit, sharedRateLimiter)
  const viewImagesTool = createViewImagesTool(ctl, websiteFetch, impit, sharedRateLimiter)

  return [webSearchTool, imageSearchTool, visitWebsiteTool, viewImagesTool]
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
        const batch = await downloadImageBatch(
          imageUrls,
          impit,
          { workingDirectory: ctl.getWorkingDirectory(), timestamp: Date.now() },
          { warn: context.warn, signal: context.signal }
        )
        const downloadedPaths: string[] = []

        for (const result of batch) {
          if (result.ok) {
            downloadedPaths.push(result.localPath)
          }
        }

        if (downloadedPaths.length === 0) {
          context.warn(IMAGE_FETCH_FAILURE_MESSAGE)

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

/**
 * Creates the Visit Website tool, which fetches an arbitrary web page and returns its
 * headings, links, downloaded images, and a search-term-aware slice of its visible text.
 *
 * @param ctl Tools provider controller supplied by the LM Studio SDK.
 * @param websiteFetch Shared website-fetch service used to retrieve HTML.
 * @param impit Shared HTTP client reused for image downloads.
 * @param rateLimiter Shared limiter enforcing the minimum gap between outbound requests.
 * @returns The configured Visit Website tool.
 */
function createVisitWebsiteTool(
  ctl: ToolsProviderController,
  websiteFetch: WebsiteFetchService,
  impit: Impit,
  rateLimiter: RateLimiter
): Tool {
  return tool({
    name: "Visit Website",
    description:
      "Visit a website and return its title, headings, links, images, and text content. Images are automatically downloaded and viewable.",
    parameters: {
      url: z.string().url().describe("The URL of the website to visit"),
      findInPage: z
        .array(z.string())
        .optional()
        .describe(
          "Highly recommended! Optional search terms to prioritize which links, images, and content to return."
        ),
      maxLinks: z
        .number()
        .int()
        .min(MIN_EXTRACTION_COUNT)
        .max(MAX_EXTRACTION_COUNT)
        .optional()
        .describe("Maximum number of links to extract from the page."),
      maxImages: z
        .number()
        .int()
        .min(MIN_EXTRACTION_COUNT)
        .max(MAX_EXTRACTION_COUNT)
        .optional()
        .describe("Maximum number of images to extract from the page."),
      contentLimit: z
        .number()
        .int()
        .min(MIN_CONTENT_LIMIT)
        .max(MAX_CONTENT_LIMIT)
        .optional()
        .describe("Maximum text content length to extract from the page."),
    },
    /**
     * Executes a website visit, parsing the HTML and downloading any referenced images.
     *
     * @param args Validated tool parameters.
     * @param args.url URL of the website to visit.
     * @param args.findInPage Optional search terms that bias ranking and content slicing.
     * @param args.maxLinks Optional per-call override for the number of extracted links.
     * @param args.maxImages Optional per-call override for the number of extracted images.
     * @param args.contentLimit Optional per-call override for the visible-text character budget.
     * @param context Runtime tool context supplied by the SDK.
     * @returns The structured page summary or a user-facing error string.
     */
    implementation: async (
      {
        url,
        findInPage,
        maxLinks: parameterMaxLinks,
        maxImages: parameterMaxImages,
        contentLimit: parameterContentLimit,
      },
      context
    ) => {
      context.status("Visiting website...")
      await rateLimiter.waitIfNeeded()

      try {
        const { maxLinks, maxImages, contentLimit } = resolveConfig(ctl, {
          maxLinks: parameterMaxLinks,
          maxImages: parameterMaxImages,
          contentLimit: parameterContentLimit,
        })
        const html = await websiteFetch.fetchHtml(url, { signal: context.signal })
        context.status("Website visited successfully.")
        const dom = parseWebsiteDocument(html)
        const headings = extractHeadings(dom)
        const links = extractLinks(dom, url, maxLinks, findInPage)
        const images = await extractAndDownloadPageImages(
          dom,
          url,
          maxImages,
          findInPage,
          impit,
          ctl.getWorkingDirectory(),
          { warn: context.warn, signal: context.signal }
        )
        const content = buildPageContent(html, url, contentLimit, findInPage)

        return {
          url,
          ...headings,
          ...(links.length > 0 ? { links } : {}),
          ...(images.length > 0 ? { images } : {}),
          ...(content.length > 0 ? { content } : {}),
        }
      } catch (error) {
        return formatToolError(error, context, "website")
      }
    },
  })
}

/**
 * Creates the View Images tool, which downloads images from an explicit URL list, from a
 * website, or both, exposing the results as Markdown image references.
 *
 * @param ctl Tools provider controller supplied by the LM Studio SDK.
 * @param websiteFetch Shared website-fetch service used when extracting images from a page.
 * @param impit Shared HTTP client reused for image downloads.
 * @param rateLimiter Shared limiter enforcing the minimum gap between outbound requests.
 * @returns The configured View Images tool.
 */
function createViewImagesTool(
  ctl: ToolsProviderController,
  websiteFetch: WebsiteFetchService,
  impit: Impit,
  rateLimiter: RateLimiter
): Tool {
  return tool({
    name: "View Images",
    description: "Download images from a website or a list of image URLs to make them viewable.",
    parameters: {
      imageURLs: z
        .array(z.string().url())
        .optional()
        .describe("List of image URLs to view that were not obtained via the Visit Website tool."),
      websiteURL: z.string().url().optional().describe("The URL of the website, whose images to view."),
      maxImages: z
        .number()
        .int()
        .min(MIN_VIEW_IMAGES_COUNT)
        .max(MAX_EXTRACTION_COUNT)
        .optional()
        .describe("Maximum number of images to view when websiteURL is provided."),
    },
    /**
     * Executes an image download batch, optionally preceded by scraping image URLs from a page.
     *
     * @param args Validated tool parameters.
     * @param args.imageURLs Explicit URLs to download.
     * @param args.websiteURL Optional page to scrape for additional image URLs.
     * @param args.maxImages Optional per-call override for the number of page-scraped images.
     * @param context Runtime tool context supplied by the SDK.
     * @returns Markdown image strings interleaved with per-URL error messages, or a user-facing error string.
     */
    implementation: async ({ imageURLs, websiteURL, maxImages: parameterMaxImages }, context) => {
      const explicitUrls = imageURLs ?? []
      const hasWebsite = websiteURL !== undefined && websiteURL !== ""

      if (explicitUrls.length === 0 && !hasWebsite) {
        return "Error: Provide at least one of imageURLs or websiteURL."
      }

      try {
        const { maxImages } = resolveConfig(ctl, { maxImages: parameterMaxImages })
        const collected: string[] = [...explicitUrls]

        if (hasWebsite) {
          context.status("Fetching image URLs from website...")
          await rateLimiter.waitIfNeeded()
          const html = await websiteFetch.fetchHtml(websiteURL, { signal: context.signal })
          const dom = parseWebsiteDocument(html)
          const scraped = extractPageImages(dom, websiteURL, maxImages)

          for (const image of scraped) {
            collected.push(image.src)
          }
        }

        if (collected.length === 0) {
          context.warn(IMAGE_FETCH_FAILURE_MESSAGE)

          return collected
        }

        context.status("Downloading images...")
        const batch = await downloadImageBatch(
          collected,
          impit,
          { workingDirectory: ctl.getWorkingDirectory(), timestamp: Date.now() },
          { warn: context.warn, signal: context.signal }
        )
        const rendered = batch.map((result, index) =>
          result.ok ? `![Image ${index + 1}](${result.localPath})` : `Error fetching image from URL: ${result.url}`
        )

        if (rendered.length === 0) {
          context.warn(IMAGE_FETCH_FAILURE_MESSAGE)

          return collected
        }

        context.status(`Downloaded ${rendered.length} images successfully.`)

        return rendered
      } catch (error) {
        return formatToolError(error, context, "image-download")
      }
    },
  })
}
