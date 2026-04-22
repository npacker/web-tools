/**
 * Scrape image URLs from a parsed page and download them, returning Markdown-ready tuples.
 */

import { extractPageImages } from "../parsers"

import { downloadImages } from "./download-images"

import type { DownloadImagesContext } from "./download-images"
import type { Impit } from "impit"
import type { JSDOM } from "jsdom"

/**
 * Extract up to `maxImages` images from the parsed page, download them, and return
 * `[alt, markdownOrError]` tuples in document order.
 *
 * @param dom Parsed website DOM.
 * @param url Absolute URL of the page, used as the resolution base for relative sources.
 * @param maxImages Upper bound on the number of images to extract and download.
 * @param searchTerms Optional terms biasing extraction ranking.
 * @param impit Shared HTTP client used for the downloads.
 * @param workingDirectory Directory into which downloaded files are written.
 * @param context Runtime hooks used for cancellation and warning output.
 * @returns Tuples of alt text paired with a Markdown image reference or a per-image error string.
 */
export async function renderPageImages(
  dom: JSDOM,
  url: string,
  maxImages: number,
  searchTerms: string[] | undefined,
  impit: Impit,
  workingDirectory: string,
  context: DownloadImagesContext
): Promise<[string, string][]> {
  if (maxImages === 0) {
    return []
  }

  const images = extractPageImages(dom, url, maxImages, searchTerms)

  if (images.length === 0) {
    return []
  }

  const batch = await downloadImages(
    images.map(image => image.src),
    impit,
    { workingDirectory, timestamp: Date.now() },
    context
  )

  return images.map((image, index) => {
    const result = batch[index]
    const markdown = result.ok
      ? `![Image ${index + 1}](${result.localPath})`
      : `Error fetching image from URL: ${image.src}`

    return [image.alt, markdown] as [string, string]
  })
}
