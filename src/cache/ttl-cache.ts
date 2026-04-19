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
   *
   * @param key Lookup key.
   * @returns The stored value, or `undefined` when absent or expired.
   */
  public async get(key: string): Promise<T | undefined> {
    const info = await cacache.get.info(this.cachePath, key)

    if (info === null) {
      return undefined
    }

    const metadata = info.metadata as CacheMetadata | undefined

    if (metadata === undefined || this.isExpired(metadata)) {
      await this.deleteEntry(key)

      return undefined
    }

    const { data } = await cacache.get(this.cachePath, key)

    return JSON.parse(data.toString("utf8")) as T
  }

  /**
   * Store a value under the given key with the configured TTL.
   *
   * @param key Key to store the value under.
   * @param value Value to associate with the key.
   */
  public async set(key: string, value: T): Promise<void> {
    await this.evictIfNeeded()
    const metadata: CacheMetadata = { expiry: Date.now() + this.ttlMs }
    await cacache.put(this.cachePath, key, JSON.stringify(value), { metadata })
  }

  /**
   * Remove an entry by key, if present.
   *
   * @param key Key to remove.
   */
  private async deleteEntry(key: string): Promise<void> {
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

    for (const entry of entries) {
      const metadata = entry.metadata as CacheMetadata | undefined

      if (metadata === undefined || now > metadata.expiry) {
        await cacache.rm.entry(this.cachePath, entry.key)
      } else {
        live.push(entry)
      }
    }

    if (live.length < this.maxSize) {
      return
    }

    live.sort((a, b) => a.time - b.time)
    await cacache.rm.entry(this.cachePath, live[0].key)
  }
}
