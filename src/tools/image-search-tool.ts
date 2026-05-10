/**
 * Image Search tool factory.
 */

import { tool, type Tool, type ToolsProviderController } from "@lmstudio/sdk"
import { z } from "zod"

import { searchImages } from "../bing"
import { resolveConfig } from "../config/resolve-config"
import { formatToolError, NoImageResultsError } from "../errors"
import { createRetryNotifier } from "../http"
import { downloadImages } from "../images"

import type { RetryOptions } from "../http"
import type { RateLimiter } from "../timing"
import type { Impit } from "impit"

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
 * @param rateLimiter Shared limiter enforcing the minimum gap between requests.
 * @param imageLimiter Shared limiter capping the number of image downloads in flight concurrently.
 * @param retry Retry policy applied to every outbound request.
 * @returns The configured image search tool.
 */
export function createImageSearchTool(
  ctl: ToolsProviderController,
  impit: Impit,
  rateLimiter: RateLimiter,
  imageLimiter: RateLimiter,
  retry: RetryOptions
): Tool {
  return tool({
    name: "Image Search",
    description: "Search for images using a query string and return a list of image records.",
    parameters: {
      query: z.string().describe("The search query for finding images."),
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
     * Executes an image search, downloading any matching images to the working directory.
     *
     * @param arguments_ Validated tool parameters.
     * @param arguments_.query Search query string.
     * @param arguments_.page Page number being requested.
     * @param context Runtime tool context supplied by the SDK.
     * @returns Per-image records pairing each downloaded path (or remote URL on download failure) with the source's title and page metadata, or a user-facing error string.
     */
    implementation: async (arguments_, context) => {
      const { query, page } = arguments_
      context.status("Initiating image search...")
      await rateLimiter.wait()

      try {
        const { imageMaxResults, safeSearch, maxImageBytes } = resolveConfig(ctl)
        const results = await searchImages(impit, { query, safeSearch, page }, imageMaxResults, {
          signal: context.signal,
          retry,
          onFailedAttempt: createRetryNotifier(context.status, "image search"),
        })

        if (results.length === 0) {
          throw new NoImageResultsError(query)
        }

        context.status(`Found ${results.length} images. Fetching...`)
        const batch = await downloadImages(
          results.map(result => result.image),
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
        const rendered = results.map((result, index) => {
          const outcome = batch[index]

          return { ...result, image: outcome.ok ? outcome.localPath : outcome.url }
        })
        const failed = batch.length - batch.filter(result => result.ok).length

        if (failed === batch.length) {
          context.warn(`Failed to download any of ${batch.length} images; returning remote URLs instead.`)
        } else if (failed > 0) {
          context.warn(`Failed to download ${failed} of ${batch.length} images; returning remote URLs for those slots.`)
        } else {
          context.status(`Downloaded ${batch.length} images successfully.`)
        }

        return rendered
      } catch (error) {
        return formatToolError(error, context, "image-search")
      }
    },
  })
}
