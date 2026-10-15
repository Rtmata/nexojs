import { withSegments, withoutSegments } from '../../shared/bridge/segment-url'
import type { Cached, ResponseCache } from './cache'
import { freshnessOf } from './freshness'

/** A page as bridge works with it: parsed, with where it came from and how it answered. */
export interface Loaded {
  page: Document
  url: URL
  status: number
  /** For a stale page shown going back: whether a newer one arrived and is in the cache now. */
  revalidated?: Promise<boolean>
}

/** What to fetch: a URL, how, and with which body (forms). */
export interface Wanted {
  url: URL
  method: string
  body?: FormData | URLSearchParams
  segments: string[]
  /** A stale entry will do (going back): shown at once, asked again behind. */
  stale?: boolean
}

/**
 * Fetches pages, through the cache for GET. Redirects are followed by
 * `fetch` itself; the final URL is what history gets (PRG works: a POST
 * answered with 303 lands on the GET page). A prefetch on its way is
 * remembered, so asking again (another hover, the click itself) joins it
 * instead of fetching twice. Any other method is a change: afterwards the
 * whole cache is dropped, so nothing shown is older than the change.
 */
export class Loader {
  private readonly ahead = new Map<string, Promise<Cached>>()

  constructor(private readonly cache: ResponseCache) {}

  async load(wanted: Wanted, signal: AbortSignal): Promise<Loaded> {
    const key = withSegments(wanted.url, wanted.segments).href
    if (wanted.method !== 'GET')
      return parse(await this.change(key, wanted, signal))
    const reused = await this.reuse(key, wanted)
    return reused ?? parse(await this.keep(key, wanted, signal))
  }

  /** Brings a GET into the cache ahead of time; nothing happens if it's there or on its way. */
  prefetch(url: URL, segments: string[]): Promise<void> {
    const key = withSegments(url, segments).href
    if (this.cache.has(key) || this.ahead.has(key)) return Promise.resolve()
    const wanted = { url, method: 'GET', segments }
    const request = this.keep(key, wanted, NO_ABORT)
    const stored = request.finally(() => this.ahead.delete(key))
    stored.catch(() => {}) // a failed prefetch is the joiner's to handle, if any
    this.ahead.set(key, stored)
    return request.then(() => {})
  }

  /** A fresh entry, one on its way, or — when stale will do — a stale one asked again behind. */
  private async reuse(
    key: string,
    wanted: Wanted,
  ): Promise<Loaded | undefined> {
    const joined = this.ahead.get(key)?.catch(() => undefined) // a failed prefetch: ask normally
    const fresh = this.cache.get(key) ?? (await joined)
    if (fresh) return parse(fresh)
    const stale = wanted.stale ? this.cache.getStale(key) : undefined
    if (!stale) return undefined
    return { ...parse(stale), revalidated: this.revalidate(key, stale, wanted) }
  }

  /** The stale entry asked again with its ETag: a 304 renews it, a page replaces it. Without an ETag there is nothing cheap to ask. */
  private async revalidate(
    key: string,
    stale: Cached,
    wanted: Wanted,
  ): Promise<boolean> {
    if (!stale.etag) return false
    const { era } = this.cache
    const answer = await this.ask(key, wanted, stale.etag)
    if (!answer) return false
    const unchanged = answer.status === 304
    this.store(key, unchanged ? renewed(stale, answer) : answer, era)
    return !unchanged
  }

  /** A conditional GET; null when it couldn't be made. */
  private ask(
    key: string,
    wanted: Wanted,
    etag: string,
  ): Promise<Cached | null> {
    const headers = { 'if-none-match': etag }
    return this.fetch(key, wanted, NO_ABORT, headers).catch(() => null)
  }

  /** Any non-GET: after it, nothing kept can be trusted, nor a prefetch still on its way. */
  private async change(
    key: string,
    wanted: Wanted,
    signal: AbortSignal,
  ): Promise<Cached> {
    const cached = await this.fetch(key, wanted, signal)
    this.cache.clear()
    this.ahead.clear()
    return cached
  }

  /** Fetches and keeps the answer, for as long as it may be kept. */
  private async keep(
    key: string,
    wanted: Wanted,
    signal: AbortSignal,
  ): Promise<Cached> {
    const { era } = this.cache
    const cached = await this.fetch(key, wanted, signal)
    this.store(key, cached, era)
    return cached
  }

  /** Kept for as long as its headers allow; errors and `no-store` not at all. */
  private store(key: string, cached: Cached, era: number): void {
    const { status, cacheControl } = cached
    const freshFor = freshnessOf(status, cacheControl, this.cache.ttl)
    if (freshFor !== null) this.cache.set(key, cached, freshFor, era)
  }

  private async fetch(
    key: string,
    wanted: Wanted,
    signal: AbortSignal,
    headers = {},
  ): Promise<Cached> {
    const response = await fetch(key, {
      method: wanted.method,
      body: wanted.body,
      headers: { accept: 'text/html', ...headers },
      signal,
    })
    return cachedFrom(response)
  }
}

const NO_ABORT = new AbortController().signal

async function cachedFrom(response: Response): Promise<Cached> {
  return {
    html: await response.text(),
    url: withoutSegments(new URL(response.url)).href,
    status: response.status,
    etag: response.headers.get('etag'),
    cacheControl: response.headers.get('cache-control'),
  }
}

/** A 304 says the stale entry still holds; the headers it brings replace the old ones (RFC 9111 §4.3.4). */
function renewed(stale: Cached, answer: Cached): Cached {
  return {
    ...stale,
    etag: answer.etag ?? stale.etag,
    cacheControl: answer.cacheControl ?? stale.cacheControl,
  }
}

function parse(cached: Cached): Loaded {
  const page = new DOMParser().parseFromString(cached.html, 'text/html')
  return { page, url: new URL(cached.url), status: cached.status }
}
