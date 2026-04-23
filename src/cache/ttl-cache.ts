/**
 * Time-to-live cache backed by `cacache` for on-disk persistence.
 */

import * as cacache from "cacache"

/**
 * Metadata attached to every cacache entry to track its expiry.
 */
interface CacheMetadata {
  /** Absolute epoch millisecond timestamp at which the entry expires. */
  expiry: number
}

/**
 * Runtime validator for the `CacheMetadata` shape stored alongside each cacache entry.
 * Protects against malformed or stale-schema metadata written by earlier plugin versions
 * producing silent `NaN` comparisons in the expiry check.
 *
 * @param value Untyped metadata value pulled from a cacache entry.
 * @returns `true` when the value is a non-null object with a numeric `expiry` property.
 */
function isCacheMetadata(value: unknown): value is CacheMetadata {
  if (typeof value !== "object" || value === null) {
    return false
  }

  if (!("expiry" in value)) {
    return false
  }

  return typeof value.expiry === "number"
}

/**
 * Disk-backed cache with per-entry time-to-live and bounded capacity.
 */
export class TTLCache<T> {
  /** Directory passed to `cacache` for all operations on this instance. */
  private readonly cachePath: string
  /** Time-to-live applied to every inserted entry, in milliseconds. */
  private readonly ttlMs: number
  /** Upper bound on the number of entries retained. */
  private readonly maxSize: number

  /**
   * Create a new cache bound by TTL and capacity.
   *
   * @param cachePath Filesystem path where cacache stores index and content.
   * @param ttlMs Lifetime of each entry in milliseconds.
   * @param maxSize Maximum number of entries retained before eviction.
   */
  public constructor(cachePath: string, ttlMs: number, maxSize: number) {
    this.cachePath = cachePath
    this.ttlMs = ttlMs
    this.maxSize = maxSize
  }

  /**
   * Retrieve a value by key, evicting and returning `undefined` when expired.
   * Always returns `undefined` when the cache is disabled (`ttlMs <= 0`).
   *
   * @param key Lookup key.
   * @returns The stored value, or `undefined` when absent, expired, or disabled.
   */
  public async get(key: string): Promise<T | undefined> {
    if (this.ttlMs <= 0) {
      return undefined
    }

    const info = await cacache.get.info(this.cachePath, key)

    if (info === null) {
      return undefined
    }

    const rawMetadata: unknown = info.metadata

    if (!isCacheMetadata(rawMetadata) || this.isExpired(rawMetadata)) {
      await this.delete(key)

      return undefined
    }

    const { data } = await cacache.get(this.cachePath, key)

    return JSON.parse(data.toString("utf8")) as T
  }

  /**
   * Store a value under the given key with the configured TTL.
   * Becomes a no-op when the cache is disabled (`ttlMs <= 0`).
   *
   * @param key Key to store the value under.
   * @param value Value to associate with the key.
   */
  public async set(key: string, value: T): Promise<void> {
    if (this.ttlMs <= 0) {
      return
    }

    await this.evictIfNeeded()
    const metadata: CacheMetadata = { expiry: Date.now() + this.ttlMs }
    await cacache.put(this.cachePath, key, JSON.stringify(value), { metadata })
  }

  /**
   * Remove an entry by key, if present.
   *
   * @param key Key to remove.
   */
  public async delete(key: string): Promise<void> {
    await cacache.rm.entry(this.cachePath, key)
  }

  /**
   * Determine whether an entry has passed its expiry timestamp.
   *
   * @param metadata Metadata to inspect.
   * @returns `true` when the entry is expired.
   */
  private isExpired(metadata: CacheMetadata): boolean {
    return Date.now() > metadata.expiry
  }

  /**
   * Make room for a new insertion by purging expired entries, then evicting
   * the oldest entry when the cache is still full.
   */
  private async evictIfNeeded(): Promise<void> {
    const entries = Object.values(await cacache.ls(this.cachePath))

    if (entries.length < this.maxSize) {
      return
    }

    const now = Date.now()
    const live: typeof entries = []
    const expired: typeof entries = []

    for (const entry of entries) {
      const rawMetadata: unknown = entry.metadata

      if (!isCacheMetadata(rawMetadata) || now > rawMetadata.expiry) {
        expired.push(entry)
      } else {
        live.push(entry)
      }
    }

    await Promise.all(expired.map(async entry => cacache.rm.entry(this.cachePath, entry.key)))

    if (live.length < this.maxSize) {
      return
    }

    live.sort((a, b) => a.time - b.time)
    await cacache.rm.entry(this.cachePath, live[0].key)
  }
}
