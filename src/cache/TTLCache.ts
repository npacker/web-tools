/**
 * Time-to-live cache implementation with automatic expiration
 */

export interface CacheEntry<T> {
  value: T
  expiry: number
}

export class TTLCache<T> {
  private readonly cache: Map<string, CacheEntry<T>>
  private readonly ttlMs: number
  private readonly maxSize: number

  public constructor(ttlMs: number, maxSize: number) {
    this.cache = new Map()
    this.ttlMs = ttlMs
    this.maxSize = maxSize
  }

  public get(key: string): T | undefined {
    const entry = this.cache.get(key)

    if (entry === undefined) {
      return undefined
    }

    if (this.isExpired(entry)) {
      this.cache.delete(key)
      return undefined
    }

    return entry.value
  }

  public set(key: string, value: T): void {
    this.evictIfNeeded()
    this.cache.set(key, {
      value,
      expiry: Date.now() + this.ttlMs,
    })
  }

  public has(key: string): boolean {
    const entry = this.cache.get(key)

    return entry !== undefined && !this.isExpired(entry)
  }

  public delete(key: string): void {
    this.cache.delete(key)
  }

  public clear(): void {
    this.cache.clear()
  }

  public get size(): number {
    return this.cache.size
  }

  private isExpired(entry: CacheEntry<T>): boolean {
    return Date.now() > entry.expiry
  }

  private evictIfNeeded(): void {
    if (this.cache.size < this.maxSize) {
      return
    }

    this.evictExpired()

    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value

      if (firstKey !== undefined) {
        this.cache.delete(firstKey)
      }
    }
  }

  private evictExpired(): void {
    const now = Date.now()
    for (const [key, entry] of this.cache) {
      if (now > entry.expiry) {
        this.cache.delete(key)
      }
    }
  }
}
