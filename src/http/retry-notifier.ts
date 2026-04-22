/**
 * Shared `p-retry` `onFailedAttempt` factory that surfaces retry progress on a tool status line.
 */

import type { Options as PRetryOptions, RetryContext } from "p-retry"

/**
 * Conversion factor from milliseconds to seconds, used when rendering retry delays.
 */
const MS_PER_SECOND = 1000

/**
 * Build an `onFailedAttempt` callback that reports the upcoming retry attempt to a tool status line.
 *
 * @param status Status-line callback supplied by the SDK tool context.
 * @param label Phase name interpolated into the status message, e.g. `"website fetch"`.
 * @returns A `p-retry` `onFailedAttempt` callback bound to the given status line and phase label.
 */
export function createRetryNotifier(
  status: (message: string) => void,
  label: string
): NonNullable<PRetryOptions["onFailedAttempt"]> {
  /**
   * Render the retry message for the next attempt.
   *
   * @param context Retry context supplied by `p-retry`.
   * @param context.attemptNumber 1-based index of the attempt that just failed.
   * @param context.retryDelay Upcoming backoff delay in milliseconds.
   */
  return ({ attemptNumber, retryDelay }: RetryContext): void => {
    status(`Retrying ${label} (attempt ${attemptNumber + 1}) in ${Math.round(retryDelay / MS_PER_SECOND)}s...`)
  }
}
