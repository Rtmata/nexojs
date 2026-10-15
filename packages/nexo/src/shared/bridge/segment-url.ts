import { SEGMENT_PARAM } from './vocabulary'

/**
 * How a request says which segments it wants: `?_segment=shelf,counter`.
 * A plain URL on purpose — you can paste it in the address bar, curl it,
 * and caches see a different resource from the full page.
 */

/** The segment names a URL asks for; empty when it asks for the whole page. */
export function segmentsOf(url: URL | string): string[] {
  const value = new URL(url, 'http://x').searchParams.get(SEGMENT_PARAM)
  return splitNames(value)
}

/**
 * A copy of `url` asking for `names` (none: a copy asking for the whole
 * page). The commas stay as written — `?_segment=shelf,counter` — so the
 * URL reads as it is typed; `URLSearchParams` would spell them `%2C`.
 */
export function withSegments(url: URL, names: readonly string[]): URL {
  const copy = new URL(url)
  copy.searchParams.delete(SEGMENT_PARAM)
  if (!names.length) return copy
  const joint = copy.search ? '&' : '?'
  copy.search = `${copy.search}${joint}${SEGMENT_PARAM}=${names.join(',')}`
  return copy
}

/** A copy of `url` asking for the whole page. */
export function withoutSegments(url: URL): URL {
  return withSegments(url, [])
}

/** `"shelf, counter"` → `['shelf', 'counter']`; blanks, empty parts and repeats dropped. */
export function splitNames(value: string | null): string[] {
  if (!value) return []
  const names = value.split(',').map((name) => name.trim())
  return [...new Set(names.filter(Boolean))]
}

/**
 * Whether two URLs name the same page: origin, path and query, with the
 * segments and the hash left out, and the query compared by its
 * parameters (`?etag` and `?etag=` are the same ask).
 */
export function samePage(a: URL, b: URL): boolean {
  const ask = (url: URL) => {
    const bare = withoutSegments(url)
    return `${bare.origin}${bare.pathname}?${bare.searchParams}`
  }
  return ask(a) === ask(b)
}
