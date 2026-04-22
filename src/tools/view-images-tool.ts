/**
 * View Images tool factory.
 */

import { tool, type Tool, type ToolsProviderController } from "@lmstudio/sdk"
import { JSDOM } from "jsdom"
import { z } from "zod"

import { resolveConfig } from "../config/resolve-config"
import { createRetryNotifier } from "../http"
import { downloadImages } from "../images"
import { extractPageImages } from "../parsers"
import { fetchWebsite } from "../website"

import { formatToolError } from "./tool-error"

import type { TTLCache } from "../cache"
import type { RetryOptions } from "../http"
import type { RateLimiter } from "../timing"
import type { Impit } from "impit"

/**
 * Lower bound on the image count when a website URL is provided.
 */
const MIN_VIEW_IMAGES_COUNT = 1
/**
 * Upper bound on the image count when a website URL is provided.
 */
const MAX_VIEW_IMAGES_COUNT = 200

/**
 * Create the View Images tool.
 *
 * @param ctl Tools provider controller supplied by the LM Studio SDK.
 * @param impit Shared HTTP client used for HTML fetches and image downloads.
 * @param websiteCache Cache holding recent HTML payloads keyed by URL.
 * @param rateLimiter Shared limiter enforcing the minimum gap between outbound requests.
 * @param retry Retry policy applied to every outbound request.
 * @returns The configured View Images tool.
 */
export function createViewImagesTool(
  ctl: ToolsProviderController,
  impit: Impit,
  websiteCache: TTLCache<string>,
  rateLimiter: RateLimiter,
  retry: RetryOptions
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
        .max(MAX_VIEW_IMAGES_COUNT)
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
          await rateLimiter.wait()
          const html = await fetchWebsite(impit, websiteCache, websiteURL, {
            signal: context.signal,
            retry,
            onFailedAttempt: createRetryNotifier(context.status, "website fetch"),
          })
          const dom = new JSDOM(html)
          const scraped = extractPageImages(dom, websiteURL, maxImages)

          for (const image of scraped) {
            collected.push(image.src)
          }
        }

        if (collected.length === 0) {
          context.warn("Error fetching images")

          return collected
        }

        context.status("Downloading images...")
        const batch = await downloadImages(
          collected,
          impit,
          { workingDirectory: ctl.getWorkingDirectory(), timestamp: Date.now() },
          {
            warn: context.warn,
            signal: context.signal,
            retry,
            onFailedAttempt: createRetryNotifier(context.status, "image download"),
          }
        )
        const rendered = batch.map((result, index) =>
          result.ok ? `![Image ${index + 1}](${result.localPath})` : `Error fetching image from URL: ${result.url}`
        )

        if (rendered.length === 0) {
          context.warn("Error fetching images")

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
