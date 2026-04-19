/**
 * Rate limiter utility for controlling request frequency.
 */

/**
 * Enforces a minimum interval between successive operations.
 */
export class RateLimiter {
  /** Epoch-millisecond timestamp of the most recent observed request. */
  private lastRequestTimestamp: number = 0
  /** Minimum gap enforced between requests, in milliseconds. */
  private readonly minIntervalMs: number

  /**
   * Create a limiter configured with the given minimum interval.
   *
   * @param minIntervalMs Minimum gap enforced between requests, in milliseconds.
   */
  public constructor(minIntervalMs: number) {
    this.minIntervalMs = minIntervalMs
  }

  /**
   * Await the remainder of the configured interval when a prior request is still within the window.
   *
   * @returns A promise that resolves once the caller is cleared to proceed.
   */
  public async waitIfNeeded(): Promise<void> {
    const currentTimestamp = Date.now()
    const timeSinceLastRequest = currentTimestamp - this.lastRequestTimestamp

    if (timeSinceLastRequest < this.minIntervalMs) {
      const delay = this.minIntervalMs - timeSinceLastRequest
      await this.delay(delay)
    }

    this.lastRequestTimestamp = Date.now()
  }

  /**
   * Resolve after the specified number of milliseconds.
   *
   * @param ms Duration to sleep, in milliseconds.
   * @returns A promise that resolves when the timer elapses.
   */
  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
