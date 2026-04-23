/**
 * Visit Website tool factory.
 */

import { tool, type Tool, type ToolsProviderController } from "@lmstudio/sdk"
import { JSDOM } from "jsdom"
import { z } from "zod"

import { resolveConfig } from "../config/resolve-config"
import { formatToolError } from "../errors"
import { createRetryNotifier, httpUrlSchema } from "../http"
import { buildPageExcerpt, extractHeadings } from "../parsers"
import { rejectUnknownParameters } from "../strict-parameters"
import { fetchWebsite } from "../website"

import type { TTLCache } from "../cache"
import type { ContentFormat } from "../config/resolve-config"
import type { RetryOptions } from "../http"
import type { RateLimiter } from "../timing"
import type { Impit } from "impit"

/**
 * Output format choices accepted by the `contentFormat` parameter.
 *
 * @const {readonly ContentFormat[]}
 * @default
 */
const CONTENT_FORMAT_OPTIONS = ["markdown", "text"] as const satisfies readonly ContentFormat[]

/**
 * Create the Visit Website tool.
 *
 * @param ctl Tools provider controller supplied by the LM Studio SDK.
 * @param impit Shared HTTP client used for HTML fetches.
 * @param websiteCache Cache holding recent HTML payloads keyed by URL.
 * @param rateLimiter Shared limiter enforcing the minimum gap between outbound requests.
 * @param retry Retry policy applied to every outbound request.
 * @returns The configured Visit Website tool.
 */
export function createVisitWebsiteTool(
  ctl: ToolsProviderController,
  impit: Impit,
  websiteCache: TTLCache<string>,
  rateLimiter: RateLimiter,
  retry: RetryOptions
): Tool {
  return tool({
    name: "Visit Website",
    description:
      "Visit a website and return its title, top-level headings, and content. When contentLength exceeds the returned content length the page was truncated — refine with findInPage.",
    parameters: {
      url: httpUrlSchema.describe("The URL of the website to visit"),
      findInPage: z
        .union([z.array(z.string()), z.string().transform(term => [term])])
        .optional()
        .describe("Strongly recommended: optional search terms to prioritize which content slices are returned."),
      contentFormat: z.enum(CONTENT_FORMAT_OPTIONS).optional().describe("Output format of the content field."),
    },

    /**
     * Executes a website visit and parses the HTML.
     *
     * @param arguments_ Validated tool parameters.
     * @param arguments_.url URL of the website to visit.
     * @param arguments_.findInPage Optional search terms that bias content slicing.
     * @param arguments_.contentFormat Optional per-call override for the content field's output format.
     * @param context Runtime tool context supplied by the SDK.
     * @returns The structured page summary or a user-facing error string.
     */
    implementation: async (arguments_, context) => {
      const guarded = rejectUnknownParameters(arguments_, ["url", "findInPage", "contentFormat"] as const)

      if (typeof guarded === "string") {
        return guarded
      }

      const { url, findInPage, contentFormat: parameterContentFormat } = guarded
      context.status("Visiting website...")
      await rateLimiter.wait()

      try {
        const { contentLimit, contentFormat, maxResponseBytes } = resolveConfig(ctl, {
          contentFormat: parameterContentFormat,
        })
        const html = await fetchWebsite(impit, websiteCache, url, {
          signal: context.signal,
          retry,
          onFailedAttempt: createRetryNotifier(context.status, "website fetch"),
          maxBytes: maxResponseBytes,
        })
        context.status("Website visited successfully.")
        const headings = extractHeadings(new JSDOM(html))
        const { content, totalLength: contentLength } = buildPageExcerpt(
          html,
          url,
          contentLimit,
          findInPage,
          contentFormat
        )

        return {
          url,
          ...headings,
          ...(content.length > 0 ? { content } : {}),
          ...(contentLength > 0 ? { contentLength } : {}),
        }
      } catch (error) {
        return formatToolError(error, context, "website")
      }
    },
  })
}
