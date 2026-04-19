/**
 * Error classes and primitives raised by the plugin.
 */

/**
 * Base error class for all DuckDuckGo-related failures raised by the plugin.
 */
class DuckDuckGoError extends Error {
  /**
   * Create a new error bound to a machine-readable code.
   *
   * @param message Human-readable error description.
   * @param code Machine-readable code identifying the error category.
   */
  public constructor(
    message: string,
    public readonly code: string
  ) {
    super(message)
    this.name = "DuckDuckGoError"
  }
}
/**
 * Raised when a search is cancelled by the caller before completion.
 */
export class SearchAbortedError extends DuckDuckGoError {
  /**
   * Create a new abort error with the standard message and code.
   */
  public constructor() {
    super("Search aborted by user.", "SEARCH_ABORTED")
    this.name = "SearchAbortedError"
  }
}
/**
 * Raised when a web or image search yields no usable results.
 */
export class NoResultsError extends DuckDuckGoError {
  /**
   * Create a no-results error tagged with the search kind.
   *
   * @param type Whether the empty result set came from a web or image search.
   */
  public constructor(public readonly type: "web" | "image") {
    const message = type === "web" ? "No web pages found for the query." : "No images found for the query."
    super(message, "NO_RESULTS")
    this.name = "NoResultsError"
  }
}
/**
 * Raised when the VQD token required for image search cannot be extracted.
 */
export class VqdTokenError extends DuckDuckGoError {
  /**
   * Create a VQD extraction error with the standard message and code.
   */
  public constructor() {
    super("Unable to extract vqd token.", "VQD_TOKEN_FAILED")
    this.name = "VqdTokenError"
  }
}
/**
 * Raised when an HTTP request to DuckDuckGo returns a non-success status.
 */
export class FetchError extends DuckDuckGoError {
  /**
   * Create a fetch error carrying an optional HTTP status code.
   *
   * @param message Human-readable error description.
   * @param statusCode Optional HTTP status code associated with the failure.
   */
  public constructor(
    message: string,
    public readonly statusCode?: number
  ) {
    super(message, "FETCH_ERROR")
    this.name = "FetchError"
  }
}

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
  return error instanceof Error ? error.message : String(error)
}
