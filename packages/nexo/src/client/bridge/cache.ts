/**
 * Responses kept for a while, keyed by the URL that was fetched (segments
 * included): back/forward, prefetch and twins all read from here, so a
 * page is fetched once however many ways ask for it. An entry is fresh for
 * a time (the response's own `max-age`, else the default), then stale: a
 * navigation ahead reuses only fresh entries; going back, a stale one will
 * do, since what the visitor saw is what counts.
 */
export interface Cached {
  html: string
  /** Where the response came from after redirects, without `_segment`. */
  url: string
  status: number
  /** The response's ETag, to ask cheaply whether a stale entry changed; null without one. */
  etag: string | null
  /** The response's `Cache-Control`, as sent; it says how long the entry is fresh. */
  cacheControl: string | null
}

interface Entry {
  cached: Cached
  freshUntil: number
}

export class ResponseCache {
  private readonly entries = new Map<string, Entry>()
  /** Changes with every `clear()`: what was asked for in an older era is not kept. */
  private _era = 0

  constructor(
    readonly ttl: number,
    private readonly now: () => number = () => Date.now(),
    private readonly limit = 50,
  ) {}

  get era(): number {
    return this._era
  }

  /** A fresh entry: what a navigation ahead may reuse. Fresh for 0 ms is stale at once, so the time itself is already past. */
  get(key: string): Cached | undefined {
    const entry = this.entries.get(key)
    return entry && entry.freshUntil > this.now() ? entry.cached : undefined
  }

  /** Any entry, fresh or stale. */
  getStale(key: string): Cached | undefined {
    return this.entries.get(key)?.cached
  }

  /**
   * Kept, fresh for `freshFor` ms (the default when not said), unless it
   * was asked for in an older `era`. The oldest entry goes when the
   * cache is full: a long session never holds more than `limit` pages.
   */
  set(
    key: string,
    cached: Cached,
    freshFor: number = this.ttl,
    era: number = this._era,
  ): void {
    if (era !== this._era) return
    this.entries.delete(key)
    this.entries.set(key, { cached, freshUntil: this.now() + freshFor })
    if (this.entries.size > this.limit) this.entries.delete(this.oldest())
  }

  private oldest(): string {
    return this.entries.keys().next().value!
  }

  has(key: string): boolean {
    return this.get(key) !== undefined
  }

  /** After a change on the server, nothing kept can be trusted, nor anything asked for before it. */
  clear(): void {
    this.entries.clear()
    this._era++
  }
}
