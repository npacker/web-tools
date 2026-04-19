/**
 * Sleep utility.
 */

/**
 * Resolve after the specified number of milliseconds.
 *
 * @param ms Duration to sleep, in milliseconds.
 * @returns A promise that resolves when the timer elapses.
 */
export async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
