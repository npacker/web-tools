/**
 * Filesystem path helpers for embedding paths in Markdown.
 */

/**
 * Pattern matching a leading Windows drive letter, with or without a preceding slash.
 */
const WINDOWS_DRIVE_PATTERN = /^\/?[A-Z]:/

/**
 * Convert a filesystem path into a form safe to embed in a Markdown link or image reference.
 * Flips Windows backslashes to forward slashes and strips any leading drive letter so the
 * result renders correctly on any host.
 *
 * @param filePath Absolute filesystem path produced by `path.join`.
 * @returns Path using forward slashes and with Windows drive letters removed.
 */
export function toMarkdownPath(filePath: string): string {
  return filePath.replaceAll("\\", "/").replace(WINDOWS_DRIVE_PATTERN, "")
}
