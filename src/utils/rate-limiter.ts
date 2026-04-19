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
  /** Tail of the pending-caller chain; each new caller awaits this before computing its own delay. */
  private queue: Promise<void> = Promise.resolve()

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
   * Concurrent callers are serialized so each one observes the completion of the one before it.
   *
   * @returns A promise that resolves once the caller is cleared to proceed.
   */
  public async waitIfNeeded(): Promise<void> {
    const next = this.queue.then(async () => {
      const timeSinceLastRequest = Date.now() - this.lastRequestTimestamp

      if (timeSinceLastRequest < this.minIntervalMs) {
        await this.delay(this.minIntervalMs - timeSinceLastRequest)
      }

      this.lastRequestTimestamp = Date.now()
    })
    this.queue = next.catch(() => {
      // Swallow rejections on the shared chain so one failure does not break subsequent callers.
    })

    return next
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
