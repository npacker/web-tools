/**
 * URL-to-filename extraction helper shared by tools that report on fetched images.
 */

/**
 * Extract the filename segment of a URL, percent-decoded. Returns an empty string when the URL
 * is malformed or the path has no trailing segment (e.g. `https://example.com/`).
 *
 * @param url Absolute URL whose path's last segment is the source filename.
 * @returns The decoded filename, or an empty string when none can be derived.
 */
export function filenameFromUrl(url: string): string {
  let pathname: string

  try {
    ;({ pathname } = new URL(url))
  } catch {
    return ""
  }

  const lastSlash = pathname.lastIndexOf("/")
  const segment = lastSlash === -1 ? pathname : pathname.slice(lastSlash + 1)

  if (segment === "") {
    return ""
  }

  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}
