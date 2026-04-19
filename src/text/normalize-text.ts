/**
 * Shared text-normalisation primitive.
 */

/**
 * Collapse whitespace runs to a single space and trim the result.
 *
 * @param text Text to normalise, possibly `null` or `undefined`.
 * @returns The trimmed text with internal whitespace runs collapsed.
 */
export function normalizeText(text: string | null | undefined): string {
  if (text === null || text === undefined) {
    return ""
  }

  return text.replaceAll(/\s+/g, " ").trim()
}
