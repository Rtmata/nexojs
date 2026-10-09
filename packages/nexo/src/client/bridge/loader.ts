import { withSegments, withoutSegments } from '../../shared/bridge/segment-url'
import type { Cached, ResponseCache } from './cache'

/** A page as bridge works with it: parsed, with where it came from and how it answered. */
export interface Loaded {
  page: Document
  url: URL
  status: number
}

/** What to fetch: a URL, how, and with which body (forms). */
export interface Wanted {
  url: URL
  method: string
  body?: FormData
  segments: string[]
}

/**
 * Fetches pages, through the cache for GET. Redirects are followed by
 * `fetch` itself; the final URL is what history gets (PRG works: a POST
 * answered with 303 lands on the GET page).
 */
export class Loader {
  constructor(private readonly cache: ResponseCache) {}

  async load(wanted: Wanted, signal: AbortSignal): Promise<Loaded> {
    const key = withSegments(wanted.url, wanted.segments).href
    const hit = wanted.method === 'GET' ? this.cache.get(key) : undefined
    const cached = hit ?? (await this.fetch(key, wanted, signal))
    if (wanted.method === 'GET' && !hit) this.cache.set(key, cached)
    return parse(cached)
  }

  /** Brings a GET into the cache ahead of time; nothing happens if it's already there. */
  async prefetch(url: URL, segments: string[]): Promise<void> {
    const key = withSegments(url, segments).href
    if (this.cache.has(key)) return
    const wanted = { url, method: 'GET', segments }
    this.cache.set(
      key,
      await this.fetch(key, wanted, new AbortController().signal),
    )
  }

  private async fetch(
    key: string,
    wanted: Wanted,
    signal: AbortSignal,
  ): Promise<Cached> {
    const response = await fetch(key, {
      method: wanted.method,
      body: wanted.body,
      headers: { accept: 'text/html' },
      signal,
    })
    const url = withoutSegments(new URL(response.url)).href
    return { html: await response.text(), url, status: response.status }
  }
}

function parse(cached: Cached): Loaded {
  const page = new DOMParser().parseFromString(cached.html, 'text/html')
  return { page, url: new URL(cached.url), status: cached.status }
}
