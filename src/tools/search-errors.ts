/**
 * Search errors raised during web and image search operations.
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
