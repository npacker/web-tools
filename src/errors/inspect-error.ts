/**
 * Generic helpers for interpreting thrown values: detecting cancellation and rendering an
 * arbitrary error into a human-readable string. Lives outside `tool-error.ts` so the latter
 * stays narrowly scoped to user-facing tool-error formatting.
 */

/**
 * Determine whether a thrown value represents an abort signal firing.
 *
 * @param error Thrown value to inspect.
 * @returns `true` when the value is a DOM abort error.
 */
export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError"
}

/**
 * Extract a human-readable message from an arbitrary thrown value.
 *
 * @param error Thrown value to stringify.
 * @returns The error message when the value is an `Error`, otherwise the stringified value.
 */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  // Avoid exposing [object Object] for plain objects; attempt JSON serialization as a fallback.
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}
