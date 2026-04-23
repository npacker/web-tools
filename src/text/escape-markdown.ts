/**
 * Markdown metacharacter escaping helpers used when embedding untrusted values inside
 * a markdown image or link reference.
 */

/**
 * Pattern matching the ASCII metacharacters that affect markdown parsing at the text level:
 * the backslash itself, bracket and parenthesis pairs, backtick, asterisk, underscore,
 * angle brackets, and the exclamation mark that introduces image references.
 *
 * @const {RegExp}
 * @default
 */
const MARKDOWN_TEXT_METACHARACTERS = /[\\[\]()`*_<>!]/g

/**
 * Pattern matching the characters that must be percent-encoded to remain safely inside
 * the URL portion of a markdown image or link reference, plus the literal backslash that
 * can creep in from Windows-origin paths.
 *
 * @const {RegExp}
 * @default
 */
const MARKDOWN_URL_METACHARACTERS = /[()[\]\\]/g

/**
 * Mapping from each URL metacharacter to its percent-encoded replacement.
 *
 * @const {Record<string, string>}
 */
const URL_REPLACEMENTS: Record<string, string> = {
  "(": "%28",
  ")": "%29",
  "[": "%5B",
  "]": "%5D",
  "\\": "%5C",
}

/**
 * Prefix a backslash before every ASCII markdown metacharacter so the value can be
 * interpolated into the text portion of a markdown image or link reference without
 * breaking out of the enclosing brackets.
 *
 * @param input Untrusted text that will be embedded between `[` and `]`.
 * @returns The input with markdown metacharacters backslash-escaped.
 */
export function escapeMarkdownText(input: string): string {
  return input.replaceAll(MARKDOWN_TEXT_METACHARACTERS, String.raw`\$&`)
}

/**
 * Percent-encode the small set of characters that cannot appear literally inside the URL
 * portion of a markdown image or link reference. Accepts a literal backslash as an
 * additional defense against Windows-origin path separators sneaking into the output.
 *
 * @param input URL or filesystem path being embedded between `(` and `)`.
 * @returns The input with parentheses, brackets, and backslashes percent-encoded.
 */
export function escapeMarkdownUrl(input: string): string {
  return input.replaceAll(MARKDOWN_URL_METACHARACTERS, match => URL_REPLACEMENTS[match] ?? match)
}
