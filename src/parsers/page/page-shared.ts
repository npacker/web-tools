/**
 * Shared helpers used across page-links, page-images, and page-text extractors.
 */

/**
 * Score bonus applied when a link label or image alt text contains a user-supplied search term.
 *
 * @const {number}
 * @default 1000
 */
const SEARCH_TERM_BONUS = 1000

/**
 * Resolve a possibly-relative URL against a base URL, returning `undefined` when either is invalid.
 *
 * @param rawUrl URL to resolve; may be absolute or relative.
 * @param baseUrl Absolute URL used as the resolution base.
 * @returns The absolute href, or `undefined` when resolution fails.
 */
export function resolveUrl(rawUrl: string, baseUrl: string): string | undefined {
  try {
    return new URL(rawUrl, baseUrl).href
  } catch {
    return undefined
  }
}

/**
 * Compute the cumulative search-term bonus for a piece of text.
 *
 * @param text Text to scan for term occurrences.
 * @param searchTerms Optional terms to look up.
 * @returns `SEARCH_TERM_BONUS` per matching term, or zero when no terms are supplied.
 */
export function termMatchBonus(text: string, searchTerms?: string[]): number {
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
