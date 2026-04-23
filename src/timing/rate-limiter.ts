/**
 * Rate limiter utility for controlling request frequency and concurrency.
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
 * Construction options for `RateLimiter`.
 */
export interface RateLimiterOptions {
  /** Minimum gap enforced between successive scheduled operations, in milliseconds. Defaults to `0`. */
  minIntervalMs?: number
  /** Maximum number of operations allowed to run concurrently. Defaults to `1`. */
  maxConcurrent?: number
}

/**
 * Enforces a minimum interval and/or a concurrency cap on scheduled operations, backed by Bottleneck.
 */
export class RateLimiter {
  /** Underlying Bottleneck limiter configured with `minTime` and `maxConcurrent`. */
  private readonly limiter: Bottleneck

  /**
   * Create a limiter configured with the given minimum interval and concurrency cap.
   *
   * @param options Limiter configuration. `minIntervalMs` defaults to `0` and `maxConcurrent` defaults to `1`.
   */
  public constructor(options: RateLimiterOptions) {
    this.limiter = new Bottleneck({
      minTime: options.minIntervalMs ?? 0,
      maxConcurrent: options.maxConcurrent ?? 1,
    })
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

  /**
   * Schedule an async task through the limiter, honouring both the minimum-interval and concurrency caps.
   * The returned promise settles with the task's result (or rejection), unchanged.
   *
   * @param task Async task to execute once the limiter admits it.
   * @returns The task's resolved value.
   */
  public async schedule<T>(task: () => Promise<T>): Promise<T> {
    return this.limiter.schedule(task)
  }
}
