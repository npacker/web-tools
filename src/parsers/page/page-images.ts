/**
 * Extract and rank images from a parsed website document.
 */

import { normalizeText } from "../../text"
import { URL_EXTENSION_PATTERN, isSupportedImageExtension } from "../image-results-parser"

import { resolveUrl, termMatchBonus } from "./page-shared"

import type { JSDOM } from "jsdom"

/**
 * A single image reference extracted from the page.
 */
interface PageImage {
  /** Alternative text from the `<img>` `alt` attribute. */
  alt: string
  /** Absolute URL of the image source. */
  src: string
}

/**
 * Internal candidate produced while walking image elements in document order.
 */
interface ImageCandidate {
  /** Alternative text from the `<img>` `alt` attribute. */
  alt: string
  /** Absolute URL of the image source after base-URL resolution. */
  src: string
  /** Original document-order position of the image. */
  index: number
}

/**
 * Extract up to `maxImages` images from the document, ranked by alt-text match against
 * caller-supplied search terms and otherwise by alt-text length.
 *
 * @param dom Parsed website DOM.
 * @param baseUrl Absolute URL used to resolve relative image sources.
 * @param maxImages Upper bound on the number of images to return.
 * @param searchTerms Optional terms boosting images whose alt text matches.
 * @returns Image descriptors in original document order, deduped by src.
 */
export function extractPageImages(dom: JSDOM, baseUrl: string, maxImages: number, searchTerms?: string[]): PageImage[] {
  if (maxImages === 0) {
    return []
  }

  const candidates = collectImageCandidates(dom, baseUrl)
  const scored = candidates.map(candidate => ({
    ...candidate,
    score: scoreImage(candidate, searchTerms),
  }))
  const topByScore = scored.toSorted((a, b) => b.score - a.score).slice(0, maxImages)
  const inDocumentOrder = topByScore.toSorted((a, b) => a.index - b.index)

  return inDocumentOrder.map(({ alt, src }) => ({ alt, src }))
}

/**
 * Collect every `<img>` with a resolvable source that ends in a supported image extension.
 *
 * @param dom Parsed website DOM.
 * @param baseUrl Absolute URL used to resolve relative sources.
 * @returns Image candidates in document order.
 */
function collectImageCandidates(dom: JSDOM, baseUrl: string): ImageCandidate[] {
  const images = dom.window.document.querySelectorAll("img[src]")
  const candidates: ImageCandidate[] = []
  let index = 0

  for (const image of images) {
    const rawSource = image.getAttribute("src")

    if (rawSource === null || rawSource === "") {
      continue
    }

    const resolved = resolveUrl(rawSource, baseUrl)

    if (resolved === undefined || !resolved.startsWith("http") || !urlHasImageExtension(resolved)) {
      continue
    }

    const alt = normalizeText(image.getAttribute("alt"))
    candidates.push({ alt, src: resolved, index })
    index += 1
  }

  return candidates
}

/**
 * Score an image candidate by its alt-text length plus a bonus for every search-term match.
 *
 * @param candidate Image to score.
 * @param searchTerms Optional terms contributing bonus score when they appear in the alt text.
 * @returns The composite score used to rank the candidate against its peers.
 */
function scoreImage(candidate: ImageCandidate, searchTerms?: string[]): number {
  return candidate.alt.length + termMatchBonus(candidate.alt, searchTerms)
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
