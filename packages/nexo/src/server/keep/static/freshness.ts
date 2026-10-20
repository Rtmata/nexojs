/**
 * How long a browser may keep a file without asking again. Unset, it
 * asks every time (`no-cache`: a cheap 304 keeps it fresh after a
 * deploy). `'immutable'` is for files whose name changes with their
 * content (a hash): a year, and the browser never asks. A number is
 * seconds. `false` sends no `Cache-Control` at all, and the browser
 * guesses from the date.
 */
export type CacheOption = 'immutable' | number | false

const A_YEAR = 31536000

/** The `Cache-Control` value for a mount or a `files()` folder; null for none. */
export function cacheControlOf(cache: CacheOption | undefined): string | null {
  if (cache === undefined) return 'no-cache'
  if (cache === false) return null
  if (cache === 'immutable') return `public, max-age=${A_YEAR}, immutable`
  return `public, max-age=${cache}`
}

/** A mistake in the option throws at setup, with the forms it takes. */
export function ensureCacheOption(cache: unknown): CacheOption | undefined {
  if (cache === undefined || cache === false || cache === 'immutable')
    return cache
  if (typeof cache === 'number' && Number.isInteger(cache) && cache >= 0)
    return cache
  throw new Error(
    `keep: cache takes 'immutable', a number of seconds or false, not ${JSON.stringify(cache)}`,
  )
}
