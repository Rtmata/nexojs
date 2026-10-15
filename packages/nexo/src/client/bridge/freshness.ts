/**
 * How long a response may be reused, read from `Cache-Control` the way
 * bridge needs it and no further: `no-store` and error answers are never
 * kept (null); `max-age` sets the time, `no-cache` means stale at once;
 * without any of them, `fallback`. `Vary` is not needed: the segments
 * travel in the URL and bridge always asks the same way.
 */
export function freshnessOf(
  status: number,
  cacheControl: string | null,
  fallback: number,
): number | null {
  if (status >= 400) return null
  const directives = directivesOf(cacheControl)
  if (directives.has('no-store')) return null
  if (directives.has('no-cache')) return 0
  const seconds = Number(directives.get('max-age') ?? NaN)
  return Number.isFinite(seconds) ? seconds * 1000 : fallback
}

/** `max-age=60, no-store` → Map { 'max-age' → '60', 'no-store' → '' }. */
function directivesOf(header: string | null): Map<string, string> {
  const directives = (header ?? '')
    .split(',')
    .map((directive) => directive.trim().toLowerCase())
    .filter((directive) => directive !== '')
    .map((directive) => directive.split('=') as [string, string?])
  return new Map(directives.map(([name, value = '']) => [name, value]))
}
