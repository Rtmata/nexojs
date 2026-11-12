import { withSegments, withoutSegments } from '../../shared/bridge/segment-url'
import type { Cached, ResponseCache } from './cache'
import { freshnessOf } from './freshness'

/** A page as bridge works with it: parsed, with where it came from and how it answered. */
export interface Loaded {
  page: Document
  url: URL
  status: number
  /** A whole document, with its doctype; segments picked out of one (`render`'s `only`) come without. */
  whole: boolean
  /** For a stale page shown going back: whether a newer one arrived and is in the cache now. */
  revalidated?: Promise<boolean>
}

/** What to fetch: a URL, how, and with which body (forms). */
export interface Wanted {
  url: URL
  method: string
  body?: FormData | URLSearchParams
  /** One per attempt of a request that changes something, the same on a retry: the server answers it once (keep's `idempotency`). */
  key?: string
  segments: string[]
  /** A stale entry will do (going back): shown at once, asked again behind. */
  stale?: boolean
}

/**
 * Fetches pages, through the cache for GET. Redirects are followed by
 * `fetch` itself; the final URL is what history gets (PRG works: a POST
 * answered with 303 lands on the GET page). A prefetch on its way is
 * remembered, so asking again (another hover, the click itself) joins it
 * instead of fetching twice. Any other method is a change: the whole
 * cache is dropped as it is sent and again once it is over — answered or
 * not, since the server may have taken it anyway — so nothing shown is
 * older than the change, nor anything asked for while it ran.
 */
export class Loader {
  private readonly ahead = new Map<string, Promise<Cached>>()
  /** What a prefetch brought and could not keep (an error, `no-store`), or could not bring: not asked ahead again until then. */
  private readonly declined = new Map<string, number>()

  constructor(private readonly cache: ResponseCache) {}

  async load(wanted: Wanted, signal: AbortSignal): Promise<Loaded> {
    const key = keyOf(wanted)
    if (wanted.method !== 'GET')
      return parse(await this.change(key, wanted, signal))
    const reused = await this.reuse(key, wanted)
    return reused ?? parse(await this.keep(key, wanted, signal))
  }

  /** Brings a GET into the cache ahead of time; nothing happens if it's there, on its way, or was declined lately. */
  prefetch(url: URL, segments: string[]): Promise<void> {
    const key = keyOf({ url, segments })
    if (this.cache.has(key) || this.ahead.has(key) || this.isDeclined(key))
      return Promise.resolve()
    const wanted = { url, method: 'GET', segments }
    const request = this.keep(key, wanted, NO_ABORT)
    const stored = request.finally(() => this.ahead.delete(key))
    stored.catch(() => this.decline(key)) // a failed prefetch is the joiner's to handle, if any
    this.ahead.set(key, stored)
    return request.then(() => {})
  }

  /** Not worth asking ahead again for a while: the cache's own term. A change clears it with the rest. */
  private decline(key: string): void {
    this.declined.set(key, Date.now() + this.cache.ttl)
  }

  /** An expired decline is dropped when looked at, so the map doesn't grow with every page seen. */
  private isDeclined(key: string): boolean {
    const until = this.declined.get(key)
    if (until === undefined) return false
    if (until > Date.now()) return true
    this.declined.delete(key)
    return false
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

  /** The stale entry asked again with its ETag: a 304 renews it, a page replaces it; an answer that can't be kept (an error) changes nothing. Without an ETag there is nothing cheap to ask. */
  private async revalidate(
    key: string,
    stale: Cached,
    wanted: Wanted,
  ): Promise<boolean> {
    if (!stale.etag) return false
    const { era } = this.cache
    const answer = await this.ask(key, wanted, stale.etag)
    if (!answer) return false
    return this.renew(key, stale, answer, era)
  }

  /** A 304 keeps the stale page, renewed; anything else is the newer page — if it could be kept at all. */
  private renew(key: string, stale: Cached, answer: Cached, era: number) {
    const unchanged = answer.status === 304
    const kept = this.store(
      key,
      unchanged ? renewed(stale, answer) : answer,
      era,
    )
    return kept && !unchanged
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

  /** Any non-GET: from the moment it is sent, nothing kept can be trusted, nor a prefetch still on its way; the same once it is over, however it ended. */
  private async change(
    key: string,
    wanted: Wanted,
    signal: AbortSignal,
  ): Promise<Cached> {
    this.forget()
    try {
      return await this.fetch(key, wanted, signal)
    } finally {
      this.forget()
    }
  }

  private forget(): void {
    this.cache.clear()
    this.ahead.clear()
    this.declined.clear()
  }

  /** Fetches and keeps the answer, for as long as it may be kept. */
  private async keep(
    key: string,
    wanted: Wanted,
    signal: AbortSignal,
  ): Promise<Cached> {
    const { era } = this.cache
    const cached = await this.fetch(key, wanted, signal)
    if (!this.store(key, cached, era)) this.decline(key)
    return cached
  }

  /** Kept for as long as its headers allow; errors and `no-store` not at all. Whether it was kept. */
  private store(key: string, cached: Cached, era: number): boolean {
    const { status, cacheControl } = cached
    const freshFor = freshnessOf(status, cacheControl, this.cache.ttl)
    if (freshFor === null) return false
    this.cache.set(key, cached, freshFor, era)
    return true
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
      headers: { accept: 'text/html', ...keyed(wanted), ...headers },
      signal,
    })
    return cachedFrom(response, key)
  }
}

const NO_ABORT = new AbortController().signal

/** The `Idempotency-Key` header, when the request has a key. */
function keyed(wanted: Wanted): Record<string, string> {
  return wanted.key ? { 'idempotency-key': wanted.key } : {}
}

/** What is asked for: the URL with its segments; the `#hash` is the page's business, not the request's, so one entry serves every hash. */
function keyOf(wanted: Pick<Wanted, 'url' | 'segments'>): string {
  const key = withSegments(wanted.url, wanted.segments)
  key.hash = ''
  return key.href
}

/** The response as kept. One a service worker built has no URL of its own: the request's (`key`) stands. */
export async function cachedFrom(
  response: Response,
  key: string,
): Promise<Cached> {
  return {
    html: await response.text(),
    url: withoutSegments(new URL(response.url || key)).href,
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
  const whole = page.doctype !== null
  return { page, url: new URL(cached.url), status: cached.status, whole }
}
