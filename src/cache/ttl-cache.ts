/**
 * Time-to-live cache implementation with automatic expiration.
 */

/**
 * A single cache entry holding the stored value and its expiration timestamp.
 */
export interface CacheEntry<T> {
  /** The cached value. */
  value: T
  /** Absolute epoch millisecond timestamp at which the entry expires. */
  expiry: number
}
/**
 * In-memory cache with per-entry time-to-live and bounded capacity.
 */
export class TTLCache<T> {
  /** Underlying key-to-entry map. */
  private readonly cache: Map<string, CacheEntry<T>>
  /** Time-to-live applied to every inserted entry, in milliseconds. */
  private readonly ttlMs: number
  /** Upper bound on the number of entries retained. */
  private readonly maxSize: number

  /**
   * Create a new cache bound by TTL and capacity.
   *
   * @param ttlMs Lifetime of each entry in milliseconds.
   * @param maxSize Maximum number of entries retained before eviction.
   */
  public constructor(ttlMs: number, maxSize: number) {
    this.cache = new Map()
    this.ttlMs = ttlMs
    this.maxSize = maxSize
  }

  /**
   * Retrieve a value by key, evicting and returning `undefined` when expired.
   *
   * @param key Lookup key.
   * @returns The stored value, or `undefined` when absent or expired.
   */
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

  /**
   * Store a value under the given key with the configured TTL.
   *
   * @param key Key to store the value under.
   * @param value Value to associate with the key.
   */
  public set(key: string, value: T): void {
    this.evictIfNeeded()
    this.cache.set(key, {
      value,
      expiry: Date.now() + this.ttlMs,
    })
  }

  /**
   * Report whether a non-expired entry exists for the key.
   *
   * @param key Key to look up.
   * @returns `true` when a live entry is present, otherwise `false`.
   */
  public has(key: string): boolean {
    const entry = this.cache.get(key)

    return entry !== undefined && !this.isExpired(entry)
  }

  /**
   * Remove an entry by key, if present.
   *
   * @param key Key to remove.
   */
  public delete(key: string): void {
    this.cache.delete(key)
  }

  /**
   * Remove every entry from the cache.
   */
  public clear(): void {
    this.cache.clear()
  }

  /**
   * Current count of stored entries, including any that have expired but not yet been evicted.
   *
   * @returns The number of entries currently held.
   */
  public get size(): number {
    return this.cache.size
  }

  /**
   * Determine whether an entry has passed its expiry timestamp.
   *
   * @param entry Entry to inspect.
   * @returns `true` when the entry is expired.
   */
  private isExpired(entry: CacheEntry<T>): boolean {
    return Date.now() > entry.expiry
  }

  /**
   * Make room for a new insertion by purging expired entries, then evicting
   * the oldest entry when the cache is still full.
   */
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

  /**
   * Remove every entry whose expiry timestamp has elapsed.
   */
  private evictExpired(): void {
    const now = Date.now()

    for (const [key, entry] of this.cache) {
      if (now > entry.expiry) {
        this.cache.delete(key)
      }
    }
  }
}
