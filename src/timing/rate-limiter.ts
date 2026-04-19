/**
 * Rate limiter utility for controlling request frequency.
 */

import Bottleneck from "bottleneck"

/**
 * No-op task scheduled on the limiter to consume one slot and serialise callers.
 *
 * @returns A resolved promise.
 */
async function noop(): Promise<void> {
  return
}

/**
 * Enforces a minimum interval between successive operations, backed by Bottleneck.
 */
export class RateLimiter {
  /** Underlying Bottleneck limiter configured with `minTime` and serial execution. */
  private readonly limiter: Bottleneck

  /**
   * Create a limiter configured with the given minimum interval.
   *
   * @param minIntervalMs Minimum gap enforced between requests, in milliseconds.
   */
  public constructor(minIntervalMs: number) {
    this.limiter = new Bottleneck({ minTime: minIntervalMs, maxConcurrent: 1 })
  }

  /**
   * Await the remainder of the configured interval when a prior request is still within the window.
   * Concurrent callers are serialized by Bottleneck so each one observes the completion of the one before it.
   *
   * @returns A promise that resolves once the caller is cleared to proceed.
   */
  public async wait(): Promise<void> {
    await this.limiter.schedule(noop)
  }
}
