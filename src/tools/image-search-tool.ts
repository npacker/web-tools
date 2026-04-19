/**
 * Image Search tool factory.
 */

import { tool, type Tool, type ToolsProviderController } from "@lmstudio/sdk"
import { z } from "zod"

import { DEFAULT_PAGE_SIZE, DEFAULT_SAFE_SEARCH, resolveConfig } from "../config/resolve-config"
import { fetchVqdToken, searchImages } from "../duckduckgo"
import { downloadImages } from "../images"
import { extractImageUrls } from "../parsers"
import { type RateLimiter, sleep } from "../timing"

import { IMAGE_DOWNLOAD_EMPTY_BATCH_MESSAGE } from "./messages"
import { NoResultsError } from "./search-errors"
import { formatToolError } from "./tool-error"

import type { TTLCache } from "../cache"
import type { Impit } from "impit"

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
 * Create the Image Search tool.
 *
 * @param ctl Tools provider controller supplied by the LM Studio SDK.
 * @param impit Shared HTTP client used for outbound requests and image downloads.
 * @param vqdCache Cache holding VQD tokens keyed by query.
 * @param rateLimiter Shared limiter enforcing the minimum gap between requests.
 * @param imageDownloadDirectory Directory where downloaded images are written.
 * @returns The configured image search tool.
 */
export function createImageSearchTool(
  ctl: ToolsProviderController,
  impit: Impit,
  vqdCache: TTLCache<string>,
  rateLimiter: RateLimiter,
  imageDownloadDirectory: string
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
      await rateLimiter.wait()

      try {
        const { pageSize, safeSearch, vqdImageDelayMs } = resolveConfig(ctl, {
          pageSize: parameterPageSize,
          safeSearch: parameterSafeSearch,
        })
        const vqd = await fetchVqdToken(impit, vqdCache, query, { signal: context.signal })
        await sleep(vqdImageDelayMs)
        const parameters = { query, pageSize, safeSearch, page }
        const imageResults = await searchImages(impit, parameters, vqd, {
          signal: context.signal,
        })
        const imageUrls = extractImageUrls(imageResults, pageSize)

        if (imageUrls.length === 0) {
          throw new NoResultsError("image")
        }

        context.status(`Found ${imageUrls.length} images. Fetching...`)
        const batch = await downloadImages(
          imageUrls,
          impit,
          { workingDirectory: imageDownloadDirectory, timestamp: Date.now() },
          { warn: context.warn, signal: context.signal }
        )
        const downloadedPaths: string[] = []

        for (const result of batch) {
          if (result.ok) {
            downloadedPaths.push(result.localPath)
          }
        }

        if (downloadedPaths.length === 0) {
          context.warn(IMAGE_DOWNLOAD_EMPTY_BATCH_MESSAGE)

          return imageUrls
        }

        context.status(`Downloaded ${downloadedPaths.length} images successfully.`)

        return downloadedPaths
      } catch (error) {
        return formatToolError(error, context, "search")
      }
    },
  })
}
