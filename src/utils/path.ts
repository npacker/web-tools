/**
 * Filesystem path normalization helpers.
 */

/**
 * Pattern matching a leading Windows drive letter, with or without a preceding slash.
 */
const WINDOWS_DRIVE_PATTERN = /^\/?[A-Z]:/

/**
 * Normalize a filesystem path for cross-platform consumption.
 * Converts Windows backslashes to forward slashes and strips any leading drive letter so the
 * result is safe to embed in Markdown or URLs on any host.
 *
 * @param filePath Absolute filesystem path produced by `path.join`.
 * @returns Path using forward slashes and with Windows drive letters removed.
 */
export function normalizePath(filePath: string): string {
  return filePath.replaceAll("\\", "/").replace(WINDOWS_DRIVE_PATTERN, "")
}
