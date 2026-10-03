import { sameTag } from '../lang/tag'
import type { Languages } from './language'
import { decodedSegments } from '../url/decode'
import type { Pattern } from './pattern'
import type { RedirectStatus } from './redirect'
import type { RedirectTarget } from './router'
import type { Handler, Method, Params } from './types'

export interface Route {
  method: Method
  pattern: Pattern
  handler: Handler
  /** Set when the route was registered with a name. */
  name?: string
  /** Set when the route is one language of a route declared per language. */
  lang?: string
  /**
   * Set when the route only redirects (see `router.redirect`): where to, so
   * tools can list redirects or write them out for a static host.
   */
  redirect?: { status: RedirectStatus; to: RedirectTarget }
}

/** The result of a successful lookup: which route answered and what it captured. */
export interface Match {
  route: Route
  params: Params
}

/**
 * Every registered route, and the lookups on them. Writes (`ensureFree`,
 * `add`) and reads (`match`, `allowed`) are separate methods.
 */
export class RouteTable {
  private readonly list: Route[] = []
  /** Routes by method and shape, so a clash is found without a full scan. */
  private readonly byShape = new Map<string, Route[]>()

  constructor(private readonly languages: Languages<string>) {}

  /** Every route, in registration order. */
  get routes(): readonly Route[] {
    return this.list
  }

  /**
   * Throws when one of these routes would answer exactly the same URLs as a
   * route already there (or as an earlier one in the list). Stores nothing.
   */
  ensureFree(incoming: readonly Route[]): void {
    incoming.forEach((route, index) => {
      const clash = this.clashFor(route, incoming.slice(0, index))
      if (clash) throw clashError(route, clash)
    })
  }

  add(route: Route): void {
    this.list.push(route)
    const same = this.byShape.get(keyOf(route))
    if (same) same.push(route)
    else this.byShape.set(keyOf(route), [route])
  }

  /**
   * The most specific route for a method and pathname, or `null`. When one
   * URL belongs to several languages, `lang` picks among them.
   */
  match(method: string, pathname: string, lang?: string): Match | null {
    const parts = decodedSegments(pathname) // decoded once for every route
    if (!parts) return null
    let best: Match | null = null
    for (const route of this.list) {
      const params = route.method === method ? route.pattern.match(parts) : null
      if (params && this.beats(route, best, lang)) best = { route, params }
    }
    return best
  }

  /** The methods that have a route for this pathname (used for 405 responses). */
  allowed(pathname: string): Method[] {
    const parts = decodedSegments(pathname)
    if (!parts) return []
    const methods = this.list
      .filter((r) => r.pattern.match(parts))
      .map((r) => r.method)
    return [...new Set(methods)]
  }

  /**
   * Same URLs are fine only when the request's language can tell the routes
   * apart without the path (`langFrom` other than 'prefix').
   */
  private clashFor(route: Route, earlier: readonly Route[]): Route | undefined {
    const same = [
      ...(this.byShape.get(keyOf(route)) ?? []),
      ...earlier.filter((r) => keyOf(r) === keyOf(route)),
    ]
    return same.find((other) => !this.languagesApart(route, other))
  }

  private languagesApart(a: Route, b: Route): boolean {
    return (
      this.languages.canSharePaths &&
      !!a.lang &&
      !!b.lang &&
      !sameTag(a.lang, b.lang)
    )
  }

  private beats(
    route: Route,
    best: Match | null,
    lang: string | undefined,
  ): boolean {
    if (!best) return true
    const order = route.pattern.compare(best.route.pattern)
    return (
      order > 0 ||
      (order === 0 &&
        this.preference(route, lang) > this.preference(best.route, lang))
    )
  }

  /**
   * Only for one URL shared by several languages: the request's language
   * answers, else the default one. The language never hides a route whose
   * path is its own (a shared /en/… link still opens for a Spanish visitor).
   */
  private preference(route: Route, lang: string | undefined): number {
    if (lang && route.lang && sameTag(route.lang, lang)) return 2
    const fallback = this.languages.default
    return route.lang && fallback && sameTag(route.lang, fallback) ? 1 : 0
  }
}

function keyOf(route: Route): string {
  return `${route.method} ${route.pattern.shape}`
}

function clashError(route: Route, clash: Route): Error {
  const hint =
    clash.lang && route.lang && clash.lang !== route.lang
      ? ". To share a path between languages, tell them apart with a langFrom that doesn't read the path (subdomain, cookie, header, query)"
      : ''
  return new Error(
    `boat: ${route.method} "${route.pattern.path}" and ${clash.method} "${clash.pattern.path}" match exactly the same URLs${hint || '. Change one of the paths'}`,
  )
}
