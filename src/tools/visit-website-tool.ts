/**
 * Visit Website tool factory.
 */

import { tool, type Tool, type ToolsProviderController } from "@lmstudio/sdk"
import { z } from "zod"

import { resolveConfig } from "../config/resolve-config"
import { formatToolError } from "../errors"
import { createRetryNotifier, httpUrlSchema } from "../http"
import { fetchWebsite, renderVisitResult } from "../website"

import type { TTLCache } from "../cache"
import type { RetryOptions } from "../http"
import type { RateLimiter } from "../timing"
import type { FetchedPage } from "../website"
import type { Impit } from "impit"

/**
 * Create the Visit Website tool.
 *
 * @param ctl Tools provider controller supplied by the LM Studio SDK.
 * @param impit Shared HTTP client used for page fetches.
 * @param websiteCache Cache holding recent fetched pages keyed by URL.
 * @param rateLimiter Shared limiter enforcing the minimum gap between outbound requests.
 * @param retry Retry policy applied to every outbound request.
 * @returns The configured Visit Website tool.
 */
export function createVisitWebsiteTool(
  ctl: ToolsProviderController,
  impit: Impit,
  websiteCache: TTLCache<FetchedPage>,
  rateLimiter: RateLimiter,
  retry: RetryOptions
): Tool {
  return tool({
    name: "Visit Website",
    description:
      "Visit a website and return its title, top-level headings, and content. When contentLength exceeds the returned content length, the content was truncated — refine with findInPage.",
    parameters: {
      url: httpUrlSchema.describe("The URL of the website to visit."),
      findInPage: z
        .array(z.string())
        .optional()
        .describe("Strongly recommended: An array of optional search terms to narrow the returned page content."),
    },

    /**
     * Executes a website visit and parses the response.
     *
     * @param arguments_ Validated tool parameters.
     * @param arguments_.url URL of the website to visit.
     * @param arguments_.findInPage Optional search terms that bias content slicing.
     * @param context Runtime tool context supplied by the SDK.
     * @returns The structured page summary or a user-facing error string.
     */
    implementation: async (arguments_, context) => {
      const { url, findInPage } = arguments_
      context.status("Visiting website...")

      try {
        const { contentLimit, contentFormat, maxResponseBytes } = resolveConfig(ctl, {})
        const cached = await websiteCache.get(url)

        if (cached === undefined) {
          await rateLimiter.wait()
        }

        const page = await fetchWebsite(impit, websiteCache, url, {
          signal: context.signal,
          retry,
          onFailedAttempt: createRetryNotifier(context.status, "website fetch"),
          maxBytes: maxResponseBytes,
        })
        context.status("Website visited successfully.")

        return renderVisitResult(url, page, { contentLimit, findInPage, contentFormat })
      } catch (error) {
        return formatToolError(error, context, "website")
      }
    },
  })
}
