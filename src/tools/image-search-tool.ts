/**
 * Image Search tool factory.
 */

import { tool, type Tool, type ToolsProviderController } from "@lmstudio/sdk"
import { z } from "zod"

import { DEFAULT_PAGE_SIZE, DEFAULT_SAFE_SEARCH, resolveConfig } from "../config/resolve-config"
import { fetchVqdToken, searchImages } from "../duckduckgo"
import { formatToolError, NoImageResultsError } from "../errors"
import { createRetryNotifier, FetchError } from "../http"
import { downloadImages } from "../images"
import { extractImageUrls } from "../parsers"
import { rejectUnknownParameters } from "../strict-parameters"
import { type RateLimiter, sleep } from "../timing"

import type { TTLCache } from "../cache"
import type { RetryOptions } from "../http"
import type { Impit } from "impit"

/**
 * HTTP status codes DuckDuckGo uses to reject a stale or invalid VQD token.
 * Encountering one triggers a single-shot token refresh + retry.
 *
 * @const {ReadonlySet<number>}
 */
const STALE_VQD_STATUS_CODES: ReadonlySet<number> = new Set([400, 401, 403, 418])

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
 * Create the Image Search tool.
 *
 * @param ctl Tools provider controller supplied by the LM Studio SDK.
 * @param impit Shared HTTP client used for outbound requests and image downloads.
 * @param vqdCache Cache holding VQD tokens keyed by query.
 * @param rateLimiter Shared limiter enforcing the minimum gap between requests.
 * @param imageLimiter Shared limiter capping the number of image downloads in flight concurrently.
 * @param retry Retry policy applied to every outbound request.
 * @returns The configured image search tool.
 */
export function createImageSearchTool(
  ctl: ToolsProviderController,
  impit: Impit,
  vqdCache: TTLCache<string>,
  rateLimiter: RateLimiter,
  imageLimiter: RateLimiter,
  retry: RetryOptions
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
     * @param arguments_ Validated tool parameters.
     * @param arguments_.query Search query string.
     * @param arguments_.pageSize Optional per-call page size override.
     * @param arguments_.safeSearch Optional per-call safe-search override.
     * @param arguments_.page Page number being requested.
     * @param context Runtime tool context supplied by the SDK.
     * @returns Either the downloaded file paths, the remote URLs on download failure, or a user-facing error string.
     */
    implementation: async (arguments_, context) => {
      const guarded = rejectUnknownParameters(arguments_, ["query", "pageSize", "safeSearch", "page"] as const)

      if (typeof guarded === "string") {
        return guarded
      }

      const { query, pageSize: parameterPageSize, safeSearch: parameterSafeSearch, page } = guarded
      context.status("Initiating DuckDuckGo image search...")
      await rateLimiter.wait()

      try {
        const { pageSize, safeSearch, vqdImageDelayMs, maxImageBytes } = resolveConfig(ctl, {
          pageSize: parameterPageSize,
          safeSearch: parameterSafeSearch,
        })
        let vqd = await fetchVqdToken(impit, vqdCache, query, {
          signal: context.signal,
          retry,
          onFailedAttempt: createRetryNotifier(context.status, "VQD token fetch"),
        })
        await sleep(vqdImageDelayMs)
        const parameters = { query, pageSize, safeSearch, page }
        const searchOptions = {
          signal: context.signal,
          retry,
          onFailedAttempt: createRetryNotifier(context.status, "image search"),
        }
        let imageResults: Awaited<ReturnType<typeof searchImages>>

        try {
          imageResults = await searchImages(impit, parameters, vqd, searchOptions)
        } catch (error) {
          if (
            !(error instanceof FetchError) ||
            error.statusCode === undefined ||
            !STALE_VQD_STATUS_CODES.has(error.statusCode)
          ) {
            throw error
          }

          context.status("VQD token rejected; refreshing and retrying image search...")
          vqd = await fetchVqdToken(
            impit,
            vqdCache,
            query,
            {
              signal: context.signal,
              retry,
              onFailedAttempt: createRetryNotifier(context.status, "VQD token refresh"),
            },
            { forceRefresh: true }
          )
          await sleep(vqdImageDelayMs)
          imageResults = await searchImages(impit, parameters, vqd, searchOptions)
        }

        const imageUrls = extractImageUrls(imageResults, pageSize)

        if (imageUrls.length === 0) {
          throw new NoImageResultsError(query)
        }

        context.status(`Found ${imageUrls.length} images. Fetching...`)
        const batch = await downloadImages(
          imageUrls,
          impit,
          { workingDirectory: ctl.getWorkingDirectory(), timestamp: Date.now(), maxBytes: maxImageBytes },
          {
            warn: context.warn,
            signal: context.signal,
            limiter: imageLimiter,
            retry,
            onFailedAttempt: createRetryNotifier(context.status, "image download"),
          }
        )
        const results = batch.map(result => (result.ok ? result.localPath : result.url))
        const failed = batch.length - batch.filter(result => result.ok).length

        if (failed === batch.length) {
          context.warn(`Failed to download any of ${batch.length} images; returning remote URLs instead.`)
        } else if (failed > 0) {
          context.warn(`Failed to download ${failed} of ${batch.length} images; returning remote URLs for those slots.`)
        } else {
          context.status(`Downloaded ${batch.length} images successfully.`)
        }

        return results
      } catch (error) {
        return formatToolError(error, context, "image-search")
      }
    },
  })
}
