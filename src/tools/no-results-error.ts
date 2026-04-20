/**
 * Errors raised when a search yields no usable results.
 */

/**
 * Shared base for empty-result errors, letting handlers catch either specialization uniformly.
 */
export abstract class NoResultsError extends Error {
  /**
   * Create a no-results error with a pre-rendered message and the originating query.
   *
   * @param message Human-readable, already-rendered error description.
   * @param query The search query that produced no results.
   */
  protected constructor(
    message: string,
    public readonly query: string
  ) {
    super(message)
    this.name = "NoResultsError"
  }
}
/**
 * Raised when a web search yields no usable results.
 */
export class NoWebResultsError extends NoResultsError {
  /**
   * Create a no-web-results error for the given query.
   *
   * @param query The search query that produced no results.
   */
  public constructor(query: string) {
    super(`No web pages found for your search: "${query}".`, query)
    this.name = "NoWebResultsError"
  }
}
/**
 * Raised when an image search yields no usable results.
 */
export class NoImageResultsError extends NoResultsError {
  /**
   * Create a no-image-results error for the given query.
   *
   * @param query The search query that produced no results.
   */
  public constructor(query: string) {
    super(`No images found for your search: "${query}".`, query)
    this.name = "NoImageResultsError"
  }
}
