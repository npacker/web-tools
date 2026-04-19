/**
 * Website content extraction utilities built on `jsdom`.
 */

import { JSDOM } from "jsdom"

import { escapeRegex } from "../utils/regex"

import { isSupportedImageExtension } from "./image-parser"

/**
 * Pattern matching the file extension of a URL's path segment, ignoring any query string.
 */
const URL_EXTENSION_PATTERN = /\.([a-z0-9]+)(?:\?|$)/i
/**
 * Coefficient used in the linear score that penalises link position in the document order.
 */
const LINK_POSITION_PENALTY_COEFFICIENT = 20
/**
 * Baseline subtracted from length/position measurements when ranking navigation-style links.
 */
const LINK_NAVIGATION_BASELINE = 100
/**
 * Score bonus applied when a link label or image alt text contains a user-supplied search term.
 */
const SEARCH_TERM_BONUS = 1000
/**
 * Structured extraction of the core heading fields on a page.
 */
export interface WebsiteHeadings {
  /** Contents of the `<title>` element, or an empty string when absent. */
  title: string
  /** Text of the first `<h1>` element, or an empty string when absent. */
  h1: string
  /** Text of the first `<h2>` element, or an empty string when absent. */
  h2: string
  /** Text of the first `<h3>` element, or an empty string when absent. */
  h3: string
}
/**
 * A single image reference extracted from the page.
 */
export interface PageImage {
  /** Alternative text from the `<img>` `alt` attribute. */
  alt: string
  /** Absolute URL of the image source. */
  src: string
}

/**
 * Parse a raw HTML payload into a `JSDOM` instance for downstream extraction.
 *
 * @param html Raw HTML string to parse.
 * @returns The parsed `JSDOM` wrapping the document.
 */
export function parseWebsiteDocument(html: string): JSDOM {
  return new JSDOM(html)
}

/**
 * Extract the document title and the first heading of each of the first three heading levels.
 *
 * @param dom Parsed website DOM.
 * @returns The extracted heading fields; missing headings default to an empty string.
 */
export function extractHeadings(dom: JSDOM): WebsiteHeadings {
  const { document } = dom.window

  return {
    title: normalizeText(document.querySelector("title")?.textContent),
    h1: normalizeText(document.querySelector("h1")?.textContent),
    h2: normalizeText(document.querySelector("h2")?.textContent),
    h3: normalizeText(document.querySelector("h3")?.textContent),
  }
}

/**
 * Extract up to `maxLinks` outbound links from the document, ranked by a heuristic that
 * favours short navigation-style labels unless the URL contains many digits (typical of
 * content IDs) or the link matches one of the caller-supplied search terms.
 *
 * @param dom Parsed website DOM.
 * @param baseUrl Absolute URL used to resolve relative link hrefs.
 * @param maxLinks Upper bound on the number of links to return.
 * @param searchTerms Optional terms boosting links whose labels match.
 * @returns Ordered `[label, href]` tuples, deduped by href.
 */
export function extractLinks(
  dom: JSDOM,
  baseUrl: string,
  maxLinks: number,
  searchTerms?: string[]
): Array<[string, string]> {
  if (maxLinks === 0) {
    return []
  }

  const candidates = collectLinkCandidates(dom, baseUrl)
  const scored = candidates.map((candidate, _index, { length }) => ({
    ...candidate,
    score: scoreLink(candidate, length, searchTerms),
  }))
  const sorted = scored.toSorted((a, b) => b.score - a.score)
  const seen = new Set<string>()
  const result: Array<[string, string]> = []

  for (const { href, label } of sorted) {
    if (seen.has(href)) {
      continue
    }

    seen.add(href)
    result.push([label, href])

    if (result.length >= maxLinks) {
      break
    }
  }

  return result
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
 * Extract the visible plain-text content of the document body, with `<script>` and `<style>`
 * content removed and internal whitespace collapsed to single spaces.
 *
 * @param dom Parsed website DOM.
 * @returns The cleaned body text, or an empty string when there is no body.
 */
export function extractVisibleText(dom: JSDOM): string {
  const { body } = dom.window.document
  const clone = body.cloneNode(true) as typeof body

  for (const node of clone.querySelectorAll("script, style, noscript")) {
    node.remove()
  }

  return normalizeText(clone.textContent)
}

/**
 * Slice a body of text around occurrences of each search term, concatenating dedup-merged
 * windows until the overall `limit` character budget is reached.
 *
 * @param text Full text from which to extract matching windows.
 * @param terms Terms to locate inside `text`.
 * @param limit Total character budget for the concatenated output.
 * @returns The concatenated windows, with overlapping ranges merged into single spans.
 */
export function sliceAroundTerms(text: string, terms: string[], limit: number): string {
  if (terms.length === 0 || limit <= 0) {
    return ""
  }

  const windowSize = Math.max(1, Math.floor(limit / (terms.length * 2)))
  const padding = `.{0,${windowSize}}`
  const matches = collectTermMatches(text, terms, padding).toSorted((a, b) => a.index - b.index)
  let output = ""
  let nextMinIndex = 0

  for (const match of matches) {
    output += match.index >= nextMinIndex ? match.text : match.text.slice(nextMinIndex - match.index)
    nextMinIndex = match.index + match.text.length

    if (output.length >= limit) {
      break
    }
  }

  return output.slice(0, limit)
}

/**
 * Internal candidate produced while walking anchor elements in document order.
 */
interface LinkCandidate {
  /** Human-readable label derived from the anchor's text content. */
  label: string
  /** Absolute href of the link after base-URL resolution. */
  href: string
  /** Original document-order position of the anchor. */
  index: number
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
 * Internal term-match record produced while building the content window list.
 */
interface TermMatch {
  /** Start offset of the match window within the source text. */
  index: number
  /** Matched substring including surrounding padding. */
  text: string
}

/**
 * Collect every anchor with an `href` that resolves to an absolute HTTP(S) URL.
 *
 * @param dom Parsed website DOM.
 * @param baseUrl Absolute URL used to resolve relative hrefs.
 * @returns Link candidates in document order.
 */
function collectLinkCandidates(dom: JSDOM, baseUrl: string): LinkCandidate[] {
  const anchors = dom.window.document.querySelectorAll("a[href]")
  const candidates: LinkCandidate[] = []
  let index = 0

  for (const anchor of anchors) {
    const rawHref = anchor.getAttribute("href")

    if (rawHref === null || rawHref === "") {
      continue
    }

    const resolved = resolveUrl(rawHref, baseUrl)

    if (resolved === undefined || !resolved.startsWith("http")) {
      continue
    }

    const label = normalizeText(anchor.textContent)
    candidates.push({ label, href: resolved, index })
    index += 1
  }

  return candidates
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

    if (resolved === undefined || !resolved.startsWith("http") || !hasSupportedExtension(resolved)) {
      continue
    }

    const alt = normalizeText(image.getAttribute("alt"))
    candidates.push({ alt, src: resolved, index })
    index += 1
  }

  return candidates
}

/**
 * Score a link candidate by blending a navigation-friendly heuristic (short label, near the top
 * of the document) with a content-friendly heuristic (many words in the label, URL contains
 * digits), and adding a bonus for every search-term match.
 *
 * @param candidate Link to score.
 * @param total Total number of link candidates, used to normalise the position penalty.
 * @param searchTerms Optional terms contributing bonus score when they appear in the label.
 * @returns The composite score used to rank the candidate against its peers.
 */
function scoreLink(candidate: LinkCandidate, total: number, searchTerms?: string[]): number {
  const digitCount = (candidate.href.match(/\d/g) ?? []).length
  const navigationWeight = 1 / (digitCount + 1)
  const positionPenalty = (LINK_POSITION_PENALTY_COEFFICIENT * candidate.index) / Math.max(total, 1)
  const navigationScore = LINK_NAVIGATION_BASELINE - (candidate.label.length + candidate.href.length + positionPenalty)
  const contentScore = candidate.label.split(/\s+/).filter(Boolean).length
  const base = navigationWeight * navigationScore + (1 - navigationWeight) * contentScore

  return base + termMatchBonus(candidate.label, searchTerms)
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
 * Compute the cumulative search-term bonus for a piece of text.
 *
 * @param text Text to scan for term occurrences.
 * @param searchTerms Optional terms to look up.
 * @returns `SEARCH_TERM_BONUS` per matching term, or zero when no terms are supplied.
 */
function termMatchBonus(text: string, searchTerms?: string[]): number {
  if (searchTerms === undefined || searchTerms.length === 0) {
    return 0
  }

  const lower = text.toLowerCase()
  let bonus = 0

  for (const term of searchTerms) {
    if (term !== "" && lower.includes(term.toLowerCase())) {
      bonus += SEARCH_TERM_BONUS
    }
  }

  return bonus
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
 * Report whether a URL's path ends in a supported image extension.
 *
 * @param url URL to inspect.
 * @returns `true` when the trailing extension is recognised by the image parser.
 */
function hasSupportedExtension(url: string): boolean {
  const match = URL_EXTENSION_PATTERN.exec(url)

  if (match === null) {
    return false
  }

  return isSupportedImageExtension(match[1].toLowerCase())
}

/**
 * Find every `padding<term>padding` match in the source text across all supplied terms.
 *
 * @param text Text to scan.
 * @param terms Terms to search for.
 * @param padding Regex fragment placed on either side of each term.
 * @returns Flattened list of term matches with their source offsets.
 */
function collectTermMatches(text: string, terms: string[], padding: string): TermMatch[] {
  const matches: TermMatch[] = []

  for (const term of terms) {
    if (term === "") {
      continue
    }

    const pattern = new RegExp(padding + escapeRegex(term) + padding, "gi")

    for (const match of text.matchAll(pattern)) {
      matches.push({ index: match.index, text: match[0] })
    }
  }

  return matches
}

/**
 * Collapse whitespace runs to a single space and trim the result.
 *
 * @param text Text to normalise, possibly `null` or `undefined`.
 * @returns The trimmed text with internal whitespace runs collapsed.
 */
function normalizeText(text: string | null | undefined): string {
  if (text === null || text === undefined) {
    return ""
  }

  return text.replaceAll(/\s+/g, " ").trim()
}
