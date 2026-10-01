import {
  compareSpecificity,
  fillPattern,
  matchPattern,
  shapeOf,
  splitPath,
  type Pattern,
} from './pattern'
import {
  parsePaths,
  pick,
  type Patterns,
  type RouteDef,
  type RoutePaths,
} from './route'
import type {
  Context,
  ErrorHandler,
  Handler,
  Link,
  LinkParams,
  LocalizedContext,
  Method,
  Params,
  PathParams,
  RouteHandler,
} from './types'

export interface Route {
  method: Method
  pattern: Pattern
  handler: Handler
  /** Set when the route was registered with a name. */
  name?: string
  /** Set when the route is one language of a route declared per language. */
  lang?: string
}

/** The result of a successful lookup: which route answered and what it captured. */
export interface Match {
  route: Route
  params: Params
}

export interface BoatOptions<L extends string> {
  /**
   * The site's languages; the first one is the default. Routes declared per
   * language must have a path for each of them (or say `{ only: [...] }`).
   */
  languages: readonly L[]
}

export interface RouteOptions<L extends string> {
  /** This route exists in these languages only, on purpose. */
  only?: readonly L[]
}

type ContextFor<
  R extends RouteDef<string, any>,
  L extends string,
> = R['paths'] extends string
  ? Context<R['params'], L>
  : LocalizedContext<R['params'], L>

/** The ways to register a route; every method (`get`, `post`…) accepts them all. */
export interface Register<L extends string> {
  /** A plain path: `router.get('/consola/:id', handler)` */
  <P extends `/${string}`, D>(
    path: P,
    handler: RouteHandler<PathParams<P>, Context<PathParams<P>, L>, D>,
  ): Router<L>
  /** A `route()` definition: `router.get(consoleRoute, handler)` */
  <R extends RouteDef<string, any>, D>(
    route: R,
    handler: RouteHandler<R['params'], ContextFor<R, L>, D>,
    options?: RouteOptions<L>,
  ): Router<L>
  /** A named path, so links can be built to it: `router.get('about', '/about', handler)` */
  <P extends `/${string}`, D>(
    name: string,
    path: P,
    handler: RouteHandler<PathParams<P>, Context<PathParams<P>, L>, D>,
  ): Router<L>
  /** A name and one path per language: `router.get('console', { es: …, en: … }, handler)` */
  <const Paths extends { readonly [K in L]?: string }, D>(
    name: string,
    paths: Paths,
    handler: RouteHandler<
      PathParams<Paths[keyof Paths] & string>,
      LocalizedContext<PathParams<Paths[keyof Paths] & string>, L>,
      D
    >,
    options?: RouteOptions<L>,
  ): Router<L>
}

export interface Router<L extends string = string> {
  get: Register<L>
  post: Register<L>
  put: Register<L>
  patch: Register<L>
  delete: Register<L>

  /** Replace the default 404 response. */
  notFound(handler: Handler): Router<L>
  /** Replace the default 500 response. */
  onError(handler: ErrorHandler): Router<L>

  /** Find the most specific route for a method and pathname, or `null`. */
  match(method: string, pathname: string): Match | null
  /** The methods that have a route for this pathname (used for 405 responses). */
  allowed(pathname: string): Method[]

  /**
   * Build the URL of a named route: `router.href('console', { id: 'nes' }, 'es')`.
   * Throws if the name, a param or the language doesn't exist.
   */
  href: Link<L>
  /**
   * The URL of the current page in every language it exists in, for a
   * language switcher or `hreflang` links. Empty for routes without languages.
   */
  alternates(ctx: { url: URL }): Partial<Record<L, string>>

  /** The languages given to `boat()`; the first one is the default. */
  readonly languages: readonly L[]
  /** Every registered route, in registration order. */
  readonly routes: readonly Route[]
  readonly notFoundHandler: Handler
  readonly errorHandler: ErrorHandler
}

const defaultNotFound: Handler = () =>
  new Response('Not Found', { status: 404 })

const defaultError: ErrorHandler = () =>
  new Response('Internal Server Error', { status: 500 })

/**
 * Create a router.
 *
 *   const router = boat()
 *   router.get('/consola/:id', ({ params }) => new Response(params.id))
 *
 * Registration order never matters: the most specific route wins
 * (static > param > wildcard), and two routes that would match exactly the
 * same URLs throw right away instead of one silently shadowing the other.
 *
 * For a site in several languages, declare them and give routes a path per
 * language. Each language becomes a normal route; `ctx.lang` says which one
 * answered:
 *
 *   const router = boat({ languages: ['en', 'es'] })
 *   router.get('console', { en: '/en/console/:id', es: '/es/consola/:id' }, handler)
 *   router.href('console', { id: 'nes' }, 'es')   // '/es/consola/nes'
 */
export function boat<const L extends string = string>(
  options?: BoatOptions<L>,
): Router<L> {
  const languages: readonly L[] = options?.languages ?? []
  const routes: Route[] = []
  const named = new Map<string, Patterns>()
  let notFoundHandler = defaultNotFound
  let errorHandler = defaultError

  function add(method: Method, args: unknown[]): Router<L> {
    const [name, paths, handler, routeOptions] = readArgs(args)
    const patterns = parsePaths(name ?? String(paths), paths)
    if (typeof paths !== 'string') {
      checkLanguages(name!, patterns, routeOptions?.only)
    }
    if (name !== undefined) remember(name, patterns)

    for (const [lang, pattern] of patterns) {
      const shape = shapeOf(pattern)
      const clash = routes.find(
        (r) => r.method === method && shapeOf(r.pattern) === shape,
      )
      if (clash) {
        throw new Error(
          `boat: ${method} "${pattern.path}" and ${method} "${clash.pattern.path}" match exactly the same URLs`,
        )
      }
      routes.push({
        method,
        pattern,
        name,
        lang,
        handler: (ctx) =>
          answer(handler, { ...ctx, lang, link: linkIn(lang) as Link }),
      })
    }
    return router
  }

  function checkLanguages(
    name: string,
    patterns: Patterns,
    only: readonly string[] | undefined,
  ) {
    if (languages.length === 0) {
      throw new Error(
        `boat: route "${name}" has a path per language, but no languages were declared. Use boat({ languages: [...] })`,
      )
    }
    const given = [...patterns.keys()] as string[]
    for (const lang of [...given, ...(only ?? [])]) {
      if (!languages.includes(lang as L)) {
        throw new Error(
          `boat: route "${name}" uses language "${lang}", which is not in boat({ languages: [${languages.map((l) => `'${l}'`).join(', ')}] })`,
        )
      }
    }
    const expected: readonly string[] = only ?? languages
    const missing = expected.filter((lang) => !given.includes(lang))
    if (missing.length > 0) {
      throw new Error(
        `boat: route "${name}" has no path for ${missing.map((l) => `"${l}"`).join(', ')}. Add it, or mark the route { only: [...] }`,
      )
    }
    const extra = given.filter((lang) => !expected.includes(lang))
    if (extra.length > 0) {
      throw new Error(
        `boat: route "${name}" has a path for ${extra.map((l) => `"${l}"`).join(', ')}, which { only } leaves out`,
      )
    }
  }

  /** One name, one set of paths: GET and POST may share a name if their paths agree. */
  function remember(name: string, patterns: Patterns) {
    const known = named.get(name)
    if (!known) {
      named.set(name, patterns)
      return
    }
    const same =
      known.size === patterns.size &&
      [...patterns].every(([lang, p]) => known.get(lang)?.path === p.path)
    if (!same) {
      throw new Error(`boat: two different routes are named "${name}"`)
    }
  }

  /** `ctx.link`: `href` with the language of the route that answered as default. */
  function linkIn(current: string | undefined): Link<L> {
    return ((
      target: string | RouteDef<string, any>,
      params?: LinkParams,
      lang?: L,
    ) => href(target, params, lang ?? (current as L))) as Link<L>
  }

  function href(
    target: string | RouteDef<string, any>,
    params?: LinkParams,
    lang?: L,
  ): string {
    if (typeof target !== 'string') {
      return (target.href as (p?: LinkParams, l?: string) => string)(
        params,
        lang,
      )
    }
    const patterns = named.get(target)
    if (!patterns) throw new Error(`boat: there is no route named "${target}"`)
    return fillPattern(pick(target, patterns, lang), params)
  }

  function alternates(ctx: { url: URL }): Partial<Record<L, string>> {
    const found = match('GET', ctx.url.pathname)
    const patterns = found?.route.name ? named.get(found.route.name) : undefined
    const result: Partial<Record<L, string>> = {}
    if (!found || !patterns || patterns.has(undefined)) return result
    for (const [lang, pattern] of patterns) {
      result[lang as L] = fillPattern(pattern, found.params)
    }
    return result
  }

  function match(method: string, pathname: string): Match | null {
    const parts = splitPath(pathname)
    let best: Match | null = null

    for (const route of routes) {
      if (route.method !== method) continue
      const params = matchPattern(route.pattern, parts)
      if (!params) continue
      if (!best || compareSpecificity(route.pattern, best.route.pattern) > 0) {
        best = { route, params }
      }
    }

    return best
  }

  function allowed(pathname: string): Method[] {
    const parts = splitPath(pathname)
    const methods = new Set<Method>()
    for (const route of routes) {
      if (matchPattern(route.pattern, parts)) methods.add(route.method)
    }
    return [...methods]
  }

  const router: Router<L> = {
    get: ((...args: unknown[]) => add('GET', args)) as Register<L>,
    post: ((...args: unknown[]) => add('POST', args)) as Register<L>,
    put: ((...args: unknown[]) => add('PUT', args)) as Register<L>,
    patch: ((...args: unknown[]) => add('PATCH', args)) as Register<L>,
    delete: ((...args: unknown[]) => add('DELETE', args)) as Register<L>,

    notFound(handler) {
      notFoundHandler = handler
      return router
    },
    onError(handler) {
      errorHandler = handler
      return router
    },

    match,
    allowed,
    href: href as Link<L>,
    alternates,

    languages,
    get routes() {
      return routes
    },
    get notFoundHandler() {
      return notFoundHandler
    },
    get errorHandler() {
      return errorHandler
    },
  }

  return router
}

type Args = [
  name: string | undefined,
  paths: RoutePaths,
  handler: RouteHandler<Params, any>,
  options: RouteOptions<string> | undefined,
]

/** The four ways to call `router.get(...)`, told apart by their first argument. */
function readArgs(args: unknown[]): Args {
  const [first, second, third, fourth] = args
  if (typeof first === 'string' && first.startsWith('/')) {
    return [undefined, first, second as Args[2], undefined]
  }
  if (isRouteDef(first)) {
    return [first.name, first.paths, second as Args[2], third as Args[3]]
  }
  if (typeof first === 'string') {
    return [first, second as RoutePaths, third as Args[2], fourth as Args[3]]
  }
  throw new Error('boat: a route needs a path, a name, or a route() definition')
}

function isRouteDef(value: unknown): value is RouteDef<string, RoutePaths> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    'paths' in value &&
    'href' in value
  )
}

/** Run a plain handler, or `load` then `page`. */
async function answer(
  handler: RouteHandler<Params, any>,
  ctx: Context,
): Promise<Response> {
  if (typeof handler === 'function') return handler(ctx)
  const data = await handler.load(ctx)
  if (data instanceof Response) return data
  return handler.page(data, ctx)
}
