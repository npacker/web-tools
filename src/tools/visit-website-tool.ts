/**
 * Visit Website tool factory.
 */

import { tool, type Tool, type ToolsProviderController } from "@lmstudio/sdk"
import { JSDOM } from "jsdom"
import { z } from "zod"

import { resolveConfig } from "../config/resolve-config"
import { formatToolError } from "../errors"
import { createRetryNotifier } from "../http"
import { renderPageImages } from "../images"
import { buildPageExcerpt, extractHeadings, extractLinks } from "../parsers"
import { fetchWebsite } from "../website"

import type { TTLCache } from "../cache"
import type { RetryOptions } from "../http"
import type { RateLimiter } from "../timing"
import type { Impit } from "impit"

/**
 * Lower bound on the link / image extraction counts.
 */
const MIN_EXTRACTION_COUNT = 0
/**
 * Upper bound on the link / image extraction counts.
 */
const MAX_EXTRACTION_COUNT = 200
/**
 * Lower bound on the visible-text character budget.
 */
const MIN_CONTENT_LIMIT = 0
/**
 * Upper bound on the visible-text character budget.
 */
const MAX_CONTENT_LIMIT = 100_000

/**
 * Create the Visit Website tool.
 *
 * @param ctl Tools provider controller supplied by the LM Studio SDK.
 * @param impit Shared HTTP client used for HTML fetches and image downloads.
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
      "Visit a website and return its title, headings, links, images, and text content. Images are automatically downloaded and viewable.",
    parameters: {
      url: z.string().url().describe("The URL of the website to visit"),
      findInPage: z
        .array(z.string())
        .optional()
        .describe(
          "Strongly recommended: optional search terms to prioritize which links, images, and content to return."
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
      await rateLimiter.wait()

      try {
        const { maxLinks, maxImages, contentLimit } = resolveConfig(ctl, {
          maxLinks: parameterMaxLinks,
          maxImages: parameterMaxImages,
          contentLimit: parameterContentLimit,
        })
        const html = await fetchWebsite(impit, websiteCache, url, {
          signal: context.signal,
          retry,
          onFailedAttempt: createRetryNotifier(context.status, "website fetch"),
        })
        context.status("Website visited successfully.")
        const dom = new JSDOM(html)
        const headings = extractHeadings(dom)
        const links = extractLinks(dom, url, maxLinks, findInPage)
        const images = await renderPageImages(dom, url, maxImages, findInPage, impit, ctl.getWorkingDirectory(), {
          warn: context.warn,
          signal: context.signal,
          retry,
          onFailedAttempt: createRetryNotifier(context.status, "image download"),
        })
        const content = buildPageExcerpt(html, url, contentLimit, findInPage)

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
