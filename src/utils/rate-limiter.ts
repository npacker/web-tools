/**
 * Rate limiter utility for controlling request frequency
 */

export class RateLimiter {
  private lastRequestTimestamp: number = 0
  private readonly minIntervalMs: number

  public constructor(minIntervalMs: number) {
    this.minIntervalMs = minIntervalMs
  }

  public async waitIfNeeded(): Promise<void> {
    const currentTimestamp = Date.now()
    const timeSinceLastRequest = currentTimestamp - this.lastRequestTimestamp

    if (timeSinceLastRequest < this.minIntervalMs) {
      const delay = this.minIntervalMs - timeSinceLastRequest
      await this.delay(delay)
    }

    this.lastRequestTimestamp = Date.now()
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
