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

/** A copy of `url` asking for `names` (none: a copy asking for the whole page). */
export function withSegments(url: URL, names: readonly string[]): URL {
  const copy = new URL(url)
  if (names.length) copy.searchParams.set(SEGMENT_PARAM, names.join(','))
  else copy.searchParams.delete(SEGMENT_PARAM)
  return copy
}

/** `"shelf, counter"` → `['shelf', 'counter']`; blanks and empty parts dropped. */
export function splitNames(value: string | null): string[] {
  if (!value) return []
  return value
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
}
