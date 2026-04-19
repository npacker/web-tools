/**
 * Regular-expression helpers.
 */

/**
 * Pattern matching every character that carries syntactic meaning inside a JavaScript regular expression.
 */
const REGEX_METACHAR_PATTERN = /[.*+?^${}()|[\]\\]/g

/**
 * Escape regular-expression metacharacters in a string so it can be embedded safely into a
 * dynamically constructed `RegExp`.
 *
 * @param value Arbitrary user-supplied string to escape.
 * @returns The input with every metacharacter prefixed by a backslash.
 */
export function escapeRegex(value: string): string {
  return value.replaceAll(REGEX_METACHAR_PATTERN, String.raw`\$&`)
}
