/**
 * VQD token error raised when the token cannot be extracted from DuckDuckGo.
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
