/**
 * View Images tool factory.
 */

import { tool, type Tool, type ToolsProviderController } from "@lmstudio/sdk"
import { JSDOM } from "jsdom"
import { z } from "zod"

import { resolveConfig } from "../config/resolve-config"
import { formatToolError } from "../errors"
import { filenameFromUrl } from "../fs"
import { createRetryNotifier, httpUrlSchema } from "../http"
import { downloadImages } from "../images"
import { extractPageImages } from "../parsers"
import { rejectUnknownParameters } from "../strict-parameters"
import { escapeMarkdownText, escapeMarkdownUrl } from "../text"
import { fetchWebsite } from "../website"

import type { TTLCache } from "../cache"
import type { RetryOptions } from "../http"
import type { RateLimiter } from "../timing"
import type { Impit } from "impit"

/**
 * Lower bound on the image count when a website URL is provided.
 *
 * @const {number}
 * @default
 */
const MIN_VIEW_IMAGES_COUNT = 1

/**
 * Upper bound on the image count when a website URL is provided.
 *
 * @const {number}
 * @default
 */
const MAX_VIEW_IMAGES_COUNT = 200

/**
 * Per-image record accumulated before downloading: the source URL plus any alt/title metadata
 * scraped from the containing page. Explicit URL arguments arrive with empty alt/title.
 */
interface ImageSubject {
  /** Absolute source URL of the image. */
  src: string
  /** Alternative text from the `<img>` `alt` attribute, or an empty string when unavailable. */
  alt: string
  /** Advisory text from the `<img>` `title` attribute, or an empty string when unavailable. */
  title: string
}

/**
 * Shape returned per image to the caller. Successful downloads include a markdown reference
 * pointing at the saved file; failures include an `error` message instead.
 */
interface ViewedImage {
  /** Filename segment of the source URL, percent-decoded when possible. */
  filename: string
  /** Alternative text from the source page's `<img>` `alt` attribute, or an empty string. */
  alt: string
  /** Advisory text from the source page's `<img>` `title` attribute, or an empty string. */
  title: string
  /** Markdown image reference pointing at the downloaded local file, present on success. */
  image?: string
  /** Human-readable error message, present when the download failed. */
  error?: string
}

/**
 * Create the View Images tool.
 *
 * @param ctl Tools provider controller supplied by the LM Studio SDK.
 * @param impit Shared HTTP client used for HTML fetches and image downloads.
 * @param websiteCache Cache holding recent HTML payloads keyed by URL.
 * @param rateLimiter Shared limiter enforcing the minimum gap between outbound requests.
 * @param imageLimiter Shared limiter capping the number of image downloads in flight concurrently.
 * @param retry Retry policy applied to every outbound request.
 * @returns The configured View Images tool.
 */
export function createViewImagesTool(
  ctl: ToolsProviderController,
  impit: Impit,
  websiteCache: TTLCache<string>,
  rateLimiter: RateLimiter,
  imageLimiter: RateLimiter,
  retry: RetryOptions
): Tool {
  return tool({
    name: "View Images",
    description: "Download images from a website or a list of image URLs to make them viewable.",
    parameters: {
      imageURLs: z
        .union([z.array(httpUrlSchema), httpUrlSchema.transform(url => [url])])
        .optional()
        .describe("List of image URLs to view that were not obtained via the Visit Website tool."),
      websiteURL: httpUrlSchema.optional().describe("The URL of the website, whose images to view."),
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
     * @param arguments_ Validated tool parameters.
     * @param arguments_.imageURLs Explicit URLs to download.
     * @param arguments_.websiteURL Optional page to scrape for additional image URLs.
     * @param arguments_.maxImages Optional per-call override for the number of page-scraped images.
     * @param context Runtime tool context supplied by the SDK.
     * @returns Per-image records with filename, alt, title, and either a markdown reference or an error, or a user-facing error string.
     */
    implementation: async (arguments_, context) => {
      const guarded = rejectUnknownParameters(arguments_, ["imageURLs", "websiteURL", "maxImages"] as const)

      if (typeof guarded === "string") {
        return guarded
      }

      const { imageURLs, websiteURL, maxImages: parameterMaxImages } = guarded
      const explicitUrls = imageURLs ?? []
      const hasWebsite = websiteURL !== undefined && websiteURL !== ""

      if (explicitUrls.length === 0 && !hasWebsite) {
        return "Error: Provide at least one of imageURLs or websiteURL."
      }

      try {
        const { maxImages, maxResponseBytes, maxImageBytes } = resolveConfig(ctl, { maxImages: parameterMaxImages })
        const subjects: ImageSubject[] = explicitUrls.map(source => ({ src: source, alt: "", title: "" }))

        if (hasWebsite) {
          context.status("Fetching image URLs from website...")
          await rateLimiter.wait()
          const html = await fetchWebsite(impit, websiteCache, websiteURL, {
            signal: context.signal,
            retry,
            onFailedAttempt: createRetryNotifier(context.status, "website fetch"),
            maxBytes: maxResponseBytes,
          })
          const scraped = extractPageImages(new JSDOM(html), websiteURL, maxImages)

          for (const image of scraped) {
            subjects.push({ src: image.src, alt: image.alt, title: image.title })
          }
        }

        if (subjects.length === 0) {
          context.warn("Error fetching images")

          return []
        }

        context.status("Downloading images...")
        const batch = await downloadImages(
          subjects.map(subject => subject.src),
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
        const rendered: ViewedImage[] = subjects.map((subject, index) => {
          const base = {
            filename: filenameFromUrl(subject.src),
            alt: subject.alt,
            title: subject.title,
          }
          const result = batch[index]

          if (result.ok) {
            const altForMarkdown = subject.alt === "" ? `Image ${index + 1}` : subject.alt

            return {
              ...base,
              image: `![${escapeMarkdownText(altForMarkdown)}](${escapeMarkdownUrl(result.localPath)})`,
            }
          }

          return { ...base, error: `Failed to fetch image from ${result.url}` }
        })

        context.status(`Processed ${rendered.length} images.`)

        return rendered
      } catch (error) {
        return formatToolError(error, context, "image-download")
      }
    },
  })
}
