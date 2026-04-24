/**
 * Defensive wrapper around the `content-type` parser so callers can consume a `Content-Type`
 * header without duplicating the `null`/malformed boilerplate.
 */

import { parse as parseContentTypeRaw, type ParsedMediaType } from "content-type"

/**
 * Parse a `Content-Type` header value, returning the structured `ParsedMediaType` or
 * `undefined` when the header is absent or malformed. Returning a single parsed object
 * lets the MIME classifier and the charset decoder share one syntax parse instead of
 * each running `parseContentTypeRaw` independently.
 *
 * @param header Raw header value, or `null` when absent.
 * @returns The parsed media type, or `undefined` when the header cannot be parsed.
 */
export function parseContentTypeSafe(header: string | null): ParsedMediaType | undefined {
  if (header === null) {
    return undefined
  }

  try {
    return parseContentTypeRaw(header)
  } catch {
    return undefined
  }
}
