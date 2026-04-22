/**
 * Extract headings and readable body text from a parsed website document.
 */

import { Readability } from "@mozilla/readability"
import Fuse from "fuse.js"
import { JSDOM } from "jsdom"

import { htmlToMarkdown, htmlToText, normalizeText } from "../../text"

import type { ContentFormat } from "../../config/resolve-config"

/**
 * Maximum Fuse.js relevance score (0 = exact match, 1 = match anything) at which a paragraph
 * is considered a fuzzy hit for a search term. Tightened from the library default (0.6) to
 * avoid returning chunks whose match is essentially noise.
 *
 * @const {number}
 * @default 0.3
 */
const FUSE_SCORE_THRESHOLD = 0.3

/**
 * Paragraph separator used when joining the selected chunks back together for emission.
 *
 * @const {string}
 * @default "\n\n"
 */
const CHUNK_JOIN_SEPARATOR = "\n\n"

/**
 * Structured extraction of the core heading fields on a page.
 */
interface PageHeadings {
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
 * Result of building a page excerpt: the (possibly truncated) content and the total length
 * of the full extracted content before truncation or term windowing was applied.
 */
export interface PageExcerpt {
  /** The excerpt actually returned to the caller, already truncated to the requested budget. */
  content: string
  /** Character count of the full extracted content prior to any truncation or windowing. */
  totalLength: number
}

/**
 * Extract the document title and the first heading of each of the first three heading levels.
 *
 * @param dom Parsed website DOM.
 * @returns The extracted heading fields; missing headings default to an empty string.
 */
export function extractHeadings(dom: JSDOM): PageHeadings {
  const { document } = dom.window

  return {
    title: normalizeText(document.querySelector("title")?.textContent),
    h1: normalizeText(document.querySelector("h1")?.textContent),
    h2: normalizeText(document.querySelector("h2")?.textContent),
    h3: normalizeText(document.querySelector("h3")?.textContent),
  }
}

/**
 * Extract the main readable content of the document via Mozilla Readability, falling back to the
 * body's inner HTML when Readability cannot identify an article, then format the HTML into the
 * requested output shape (markdown or plain text).
 *
 * @param html Raw HTML payload.
 * @param url Absolute URL of the page, used by Readability to resolve relative references.
 * @param format Output format applied to the extracted content.
 * @returns The cleaned article content, or an empty string when neither extraction strategy yields content.
 */
function extractVisibleText(html: string, url: string, format: ContentFormat): string {
  const readabilityDom = new JSDOM(html, { url })
  const article = new Readability(readabilityDom.window.document).parse()

  const articleContent = article?.content

  if (articleContent !== null && articleContent !== undefined && articleContent !== "") {
    return formatHtml(articleContent, format)
  }

  const fallbackDom = new JSDOM(html)
  const { body } = fallbackDom.window.document

  return formatHtml(body.innerHTML, format)
}

/**
 * Convert an HTML fragment to the requested output format.
 *
 * @param htmlFragment HTML to convert.
 * @param format Target output format.
 * @returns The formatted content string.
 */
function formatHtml(htmlFragment: string, format: ContentFormat): string {
  switch (format) {
    case "markdown": {
      return htmlToMarkdown(htmlFragment)
    }

    case "text": {
      return htmlToText(htmlFragment)
    }
  }
}

/**
 * Build the visible-text payload for the Visit Website tool: when search terms are supplied
 * and the full text exceeds the budget, concatenate the highest-scoring paragraphs selected
 * via fuzzy matching; otherwise return a head slice of the full text. Also reports the
 * pre-truncation length so callers can detect truncation and refine with search terms or
 * raise the plugin setting.
 *
 * @param html Raw HTML payload used by Readability to extract the main article text.
 * @param url Absolute URL of the page, passed to Readability for relative-link resolution.
 * @param contentLimit Character budget for the returned text.
 * @param searchTerms Optional search terms biasing content selection.
 * @param format Output format applied to the extracted content.
 * @returns The excerpt and the total length of the full extracted content before truncation.
 */
export function buildPageExcerpt(
  html: string,
  url: string,
  contentLimit: number,
  searchTerms: string[] | undefined,
  format: ContentFormat
): PageExcerpt {
  if (contentLimit <= 0) {
    return { content: "", totalLength: 0 }
  }

  const allContent = extractVisibleText(html, url, format)
  const totalLength = allContent.length

  if (searchTerms !== undefined && searchTerms.length > 0 && contentLimit < totalLength) {
    const sliced = sliceAroundTerms(allContent, searchTerms, contentLimit)

    if (sliced.length > 0) {
      return { content: sliced, totalLength }
    }
  }

  return { content: allContent.slice(0, contentLimit), totalLength }
}

/**
 * Select the paragraphs that best match the supplied search terms via Fuse.js fuzzy matching,
 * grow outward through their neighbouring paragraphs until the character budget is exhausted,
 * and concatenate the result in document order. Fuzzy matching tolerates typos, inflections,
 * and partial word overlaps that a case-insensitive `indexOf` scan would miss, while still
 * favouring exact matches (which score near zero). The symmetric expansion ensures a large
 * `contentLimit` is actually filled with surrounding context instead of leaving budget unused
 * when only a handful of paragraphs match.
 *
 * @param text Full text from which to extract matching paragraphs.
 * @param terms Terms to locate inside `text`.
 * @param limit Total character budget for the concatenated output.
 * @returns The concatenated paragraphs, emitted in source order, truncated to `limit`.
 */
function sliceAroundTerms(text: string, terms: string[], limit: number): string {
  if (terms.length === 0 || limit <= 0) {
    return ""
  }

  const chunks = splitIntoChunks(text)

  if (chunks.length === 0) {
    return ""
  }

  const rankedIndices = rankChunksByTerms(chunks, terms)

  if (rankedIndices.length === 0) {
    return ""
  }

  const selected = selectAroundMatches(rankedIndices, chunks, limit)

  if (selected.size === 0) {
    return ""
  }

  return [...selected]
    .toSorted((a, b) => a - b)
    .map(index => chunks[index])
    .join(CHUNK_JOIN_SEPARATOR)
    .slice(0, limit)
}

/**
 * Grow a selection outward from each ranked match, adding paragraphs in priority order (matches
 * first, then the ±1 neighbours of every match, then ±2, and so on) until the character budget
 * is filled. Higher-scoring matches and their inner neighbourhoods are always admitted before
 * lower-scoring matches reach their outer neighbourhoods, preserving the Fuse.js ranking while
 * ensuring the budget is consumed when enough source material is available. Candidates whose
 * inclusion would overshoot the budget are skipped in favour of lower-priority ones that still
 * fit, so no chunk is silently truncated in document order by the final slice. The highest-
 * priority chunk is admitted unconditionally so an oversized top match never yields an empty
 * excerpt (the final slice will trim it to the budget).
 *
 * @param rankedIndices Chunk indices ordered from best to worst fuzzy match.
 * @param chunks Paragraph-level chunks of the page text, indexed in source order.
 * @param limit Character budget to fill, accounting for paragraph separators between chunks.
 * @returns Set of chunk indices chosen for inclusion, unordered.
 */
function selectAroundMatches(rankedIndices: number[], chunks: string[], limit: number): Set<number> {
  const selected = new Set<number>()
  let total = 0

  for (const candidate of prioritizedCandidates(rankedIndices, chunks.length)) {
    if (total >= limit) {
      break
    }

    if (selected.has(candidate)) {
      continue
    }

    const separatorCost = selected.size > 0 ? CHUNK_JOIN_SEPARATOR.length : 0
    const projected = total + separatorCost + chunks[candidate].length

    if (selected.size > 0 && projected > limit) {
      continue
    }

    selected.add(candidate)
    total = projected
  }

  return selected
}

/**
 * Enumerate chunk indices in priority order for symmetric neighbourhood expansion: the matches
 * themselves first, then their ±1 neighbours (iterated across all matches), then ±2, and so on
 * out to the document edges. Duplicate indices are emitted when multiple matches share a
 * neighbour; the caller is expected to deduplicate.
 *
 * @param rankedIndices Chunk indices ordered from best to worst fuzzy match.
 * @param chunkCount Total number of chunks in the source document.
 * @returns Flat list of candidate chunk indices in emission order.
 */
function prioritizedCandidates(rankedIndices: number[], chunkCount: number): number[] {
  const candidates: number[] = [...rankedIndices]
  const lastIndex = chunkCount - 1

  for (let radius = 1; radius <= lastIndex; radius++) {
    for (const matchIndex of rankedIndices) {
      const left = matchIndex - radius
      const right = matchIndex + radius

      if (left >= 0) {
        candidates.push(left)
      }

      if (right <= lastIndex) {
        candidates.push(right)
      }
    }
  }

  return candidates
}

/**
 * Rank chunk indices by the best (lowest) Fuse.js score achieved across any of the supplied
 * terms, discarding chunks that fail the score threshold for every term.
 *
 * @param chunks Paragraph-level chunks of the page text, in source order.
 * @param terms Search terms to match against each chunk.
 * @returns Chunk indices ordered from best to worst match.
 */
function rankChunksByTerms(chunks: string[], terms: string[]): number[] {
  const fuse = new Fuse(chunks, {
    includeScore: true,
    ignoreLocation: true,
    threshold: FUSE_SCORE_THRESHOLD,
  })
  const bestScore = new Map<number, number>()

  for (const term of terms) {
    if (term === "") {
      continue
    }

    for (const { refIndex, score } of fuse.search(term)) {
      if (score === undefined) {
        continue
      }

      const current = bestScore.get(refIndex)

      if (current === undefined || score < current) {
        bestScore.set(refIndex, score)
      }
    }
  }

  return [...bestScore.entries()].toSorted(([, a], [, b]) => a - b).map(([index]) => index)
}

/**
 * Split normalized page text into paragraph-level chunks on blank-line boundaries, discarding
 * any empty segments produced by the split.
 *
 * @param text Full page text already normalized to collapse runs of blank lines.
 * @returns Trimmed paragraph chunks in source order.
 */
function splitIntoChunks(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map(paragraph => paragraph.trim())
    .filter(paragraph => paragraph.length > 0)
}
