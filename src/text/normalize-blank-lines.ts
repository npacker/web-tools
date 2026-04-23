/**
 * Whitespace normalizer shared by the Visit Website tool's HTML-to-markdown and HTML-to-text converters.
 */

/**
 * Maximum number of consecutive newlines permitted in the normalized output; runs longer than
 * this are collapsed to a single blank line between paragraphs.
 *
 * @const {number}
 * @default
 */
const MAX_CONSECUTIVE_NEWLINES = 2

/**
 * Strip trailing whitespace from each line, collapse runs of three or more consecutive newlines
 * to a single blank line, and trim the result.
 *
 * @param text Text produced by the markdown or plain-text converter.
 * @returns The cleaned text string.
 */
export function normalizeBlankLines(text: string): string {
  return text
    .split("\n")
    .map(line => line.trimEnd())
    .join("\n")
    .replaceAll(/\n{3,}/g, "\n".repeat(MAX_CONSECUTIVE_NEWLINES))
    .trim()
}
