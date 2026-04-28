/**
 * Per-host rate limiter built on `Bottleneck.Group`. Each unique URL host gets its own
 * underlying Bottleneck limiter, so calls to different hosts run concurrently while calls
 * to the same host still observe the configured minimum interval. Idle per-host limiters
 * are automatically reaped by Bottleneck after their TTL elapses.
 */

import Bottleneck from "bottleneck"

/**
 * No-op task scheduled on a per-host limiter to consume one slot and serialise callers
 * targeting the same host.
 *
 * @returns A resolved promise.
 */
async function noop(): Promise<void> {
  return
}

/**
 * Construction options for `PerHostRateLimiter`.
 */
export interface PerHostRateLimiterOptions {
  /** Minimum gap enforced between successive scheduled operations against the same host, in milliseconds. */
  minIntervalMs: number
  /** Maximum number of operations allowed to run concurrently against a single host. Defaults to `1`. */
  maxConcurrentPerHost?: number
}

/**
 * Enforces a minimum interval between requests targeted at the same host while permitting
 * concurrent requests across distinct hosts. Falls back to the raw URL string as the
 * limiter key when host extraction fails so an unparseable URL still observes serialisation
 * with itself rather than racing free.
 */
export class PerHostRateLimiter {
  /** Underlying Bottleneck group that lazily mints a per-key limiter on demand. */
  private readonly group: Bottleneck.Group

  /**
   * Create a per-host limiter configured with the given interval and concurrency cap.
   *
   * @param options Limiter configuration. `maxConcurrentPerHost` defaults to `1` so calls to a single host serialise; configure higher when downstream tolerates parallel access.
   */
  public constructor(options: PerHostRateLimiterOptions) {
    this.group = new Bottleneck.Group({
      minTime: options.minIntervalMs,
      maxConcurrent: options.maxConcurrentPerHost ?? 1,
    })
  }

  /**
   * Await the minimum interval against the host extracted from `url`, returning once the
   * caller is cleared to issue an outbound request to that host. Calls to different hosts
   * resolve independently and may proceed concurrently.
   *
   * @param url URL whose host scopes the wait.
   * @returns A promise that resolves once the caller is cleared to proceed.
   */
  public async wait(url: string): Promise<void> {
    await this.group.key(hostKey(url)).schedule(noop)
  }

  /**
   * Schedule an async task on the limiter for the host extracted from `url`. The returned
   * promise settles with the task's result, unchanged.
   *
   * @param url URL whose host scopes the schedule.
   * @param task Async task to execute once the per-host limiter admits it.
   * @returns The task's resolved value.
   */
  public async schedule<T>(url: string, task: () => Promise<T>): Promise<T> {
    return this.group.key(hostKey(url)).schedule(task)
  }
}

/**
 * Derive a stable per-host key from a URL string, falling back to the raw input when the
 * URL is unparseable. The fallback is namespaced so a malformed URL cannot collide with a
 * legitimate host name.
 *
 * @param url URL string to derive the key from.
 * @returns A stable key suitable for `Bottleneck.Group.key`.
 */
function hostKey(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return `__unparseable__:${url}`
  }
}
