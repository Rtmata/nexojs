import type { PathParams } from '../../shared/http/types'
import type { NotFound } from '../../shared/boat/not-found'
import { Pattern } from '../../shared/boat/pattern'
import type { Params } from '../../shared/boat/types'
import { decodedSegments } from '../../shared/url/decode'

/** What a client route's `load` gets (E.2): no `Request` here, a signal for the latest-wins. */
export interface LoadContext<P extends Params = Params> {
  params: P
  url: URL
  signal: AbortSignal
}

/** What `page` gets besides the data. */
export interface PageContext<P extends Params = Params> {
  params: P
  url: URL
}

/** boat's server form `{ load, page }` (E.2); `page` returns JSX here, not a `Response`. */
export interface ClientRoute<P extends Params = Params, D = any> {
  load?(ctx: LoadContext<P>): D | NotFound | PromiseLike<D | NotFound>
  page(data: D, ctx: PageContext<P>): unknown
}

export interface ClientMatch {
  route: ClientRoute
  params: Params
}

type Table<R> = { [Path in keyof R]: ClientRoute<PathParams<Path & string>> }

/**
 * Client routes (R.21): the same patterns as the server's — `:id`, `*`,
 * decoding, the most specific wins — returned as the plain `match` function
 * the client router takes (E.1).
 *
 *   const match = routes({ '/': shelf, '/book/:id': { load, page } })
 */
export function routes<const R extends Table<R>>(
  table: R,
): (url: URL) => ClientMatch | null {
  const compiled = Object.entries(table as Record<string, ClientRoute>).map(
    ([path, route]) => ({ pattern: new Pattern(path), route }),
  )
  return (url) => best(compiled, url)
}

function best(
  compiled: { pattern: Pattern; route: ClientRoute }[],
  url: URL,
): ClientMatch | null {
  const parts = decodedSegments(url.pathname)
  if (!parts) return null
  let found: { pattern: Pattern; match: ClientMatch } | null = null
  for (const { pattern, route } of compiled) {
    const params = pattern.match(parts)
    if (params && (!found || pattern.compare(found.pattern) > 0))
      found = { pattern, match: { route, params } }
  }
  return found?.match ?? null
}
