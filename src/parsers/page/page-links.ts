/**
 * Extract and rank outbound links from a parsed website document.
 */

import { normalizeText } from "../../text"

import { resolveUrl, termMatchBonus } from "./page-shared"

import type { JSDOM } from "jsdom"

/**
 * Coefficient used in the linear score that penalises link position in the document order.
 *
 * @const {number}
 * @default 20
 */
const LINK_POSITION_PENALTY_COEFFICIENT = 20

/**
 * Baseline subtracted from length/position measurements when ranking navigation-style links.
 *
 * @const {number}
 * @default 100
 */
const LINK_NAVIGATION_BASELINE = 100

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
): [string, string][] {
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
  const result: [string, string][] = []

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

    if (resolved?.startsWith("http") !== true) {
      continue
    }

    const label = normalizeText(anchor.textContent)
    candidates.push({ label, href: resolved, index })
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
