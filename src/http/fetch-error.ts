/**
 * HTTP error raised when a request to DuckDuckGo returns a non-success status.
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
