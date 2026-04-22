/**
 * Extract images from a parsed website document.
 */

import { normalizeText } from "../../text"
import { URL_EXTENSION_PATTERN, isSupportedImageExtension } from "../image-results-parser"

import type { JSDOM } from "jsdom"

/**
 * A single image reference extracted from the page.
 */
export interface PageImage {
  /** Alternative text from the `<img>` `alt` attribute, or an empty string when absent. */
  alt: string
  /** Advisory text from the `<img>` `title` attribute, or an empty string when absent. */
  title: string
  /** Absolute URL of the image source. */
  src: string
}

/**
 * Extract up to `maxImages` images from the document in document order, deduped by src.
 *
 * @param dom Parsed website DOM.
 * @param baseUrl Absolute URL used to resolve relative image sources.
 * @param maxImages Upper bound on the number of images to return.
 * @returns Image descriptors in original document order, deduped by src.
 */
export function extractPageImages(dom: JSDOM, baseUrl: string, maxImages: number): PageImage[] {
  if (maxImages === 0) {
    return []
  }

  const images = dom.window.document.querySelectorAll("img[src]")
  const results: PageImage[] = []
  const seen = new Set<string>()

  for (const image of images) {
    const rawSource = image.getAttribute("src")

    if (rawSource === null || rawSource === "") {
      continue
    }

    const resolved = resolveUrl(rawSource, baseUrl)

    if (resolved === undefined || !resolved.startsWith("http") || !urlHasImageExtension(resolved)) {
      continue
    }

    if (seen.has(resolved)) {
      continue
    }

    seen.add(resolved)
    results.push({
      alt: normalizeText(image.getAttribute("alt")),
      title: normalizeText(image.getAttribute("title")),
      src: resolved,
    })

    if (results.length >= maxImages) {
      break
    }
  }

  return results
}

/**
 * Resolve a possibly-relative URL against a base URL, returning `undefined` when either is invalid.
 *
 * @param rawUrl URL to resolve; may be absolute or relative.
 * @param baseUrl Absolute URL used as the resolution base.
 * @returns The absolute href, or `undefined` when resolution fails.
 */
function resolveUrl(rawUrl: string, baseUrl: string): string | undefined {
  try {
    return new URL(rawUrl, baseUrl).href
  } catch {
    return undefined
  }
}

/**
 * Report whether a URL's path ends in a supported image extension, tolerating query strings.
 *
 * @param url URL to inspect.
 * @returns `true` when the trailing extension is recognised by the image parser.
 */
function urlHasImageExtension(url: string): boolean {
  const match = URL_EXTENSION_PATTERN.exec(url)

  if (match === null) {
    return false
  }

  return isSupportedImageExtension(match[1].toLowerCase())
}
