import { Languages, type LangFrom } from './language'
import { Links } from './links'
import { NameBook } from './name-book'
import { isNotFound } from '../http/not-found'
import type { Pattern } from './pattern'
import { redirect, type RedirectStatus } from './redirect'
import { isAbsolute, RedirectSource, Redirects } from './redirects'
import { Registration } from './registration'
import { isRouteDef, Variants, type RouteDef, type RoutePaths } from './route'
import { RouteTable, type Match, type Route } from './route-table'
import type {
  Context,
  ErrorHandler,
  Handler,
  Link,
  LocalizedContext,
  Method,
  Params,
  PathParams,
  RouteHandler,
} from './types'

export type { Match, Route } from './route-table'

export interface BoatOptions<L extends string> {
  /**
   * The site's languages; the first one is the default. Routes declared per
   * language must have a path for each of them (or say `{ only: [...] }`).
   */
  languages: readonly L[]
  /**
   * Where each request's language comes from: `'prefix'`, `'subdomain'`,
   * `'header'`, `{ cookie: 'lang' }`, `{ query: 'lang' }`, a list of them
   * tried in order, or your own `(request) => lang`. See `LangFrom`.
   *
   * The language then picks among routes too, so with a subdomain or a
   * cookie two languages may share a path: `{ en: '/arcade', es: '/arcade' }`.
   * Requests no route answers (404s, errors) get it as `ctx.lang` as well.
   */
  langFrom?: LangFrom
}

export interface RouteOptions<L extends string> {
  /** This route exists in these languages only, on purpose. */
  only?: readonly L[]
}

/**
 * Where a declared redirect goes: a path or a full URL, a `route()`
 * (params carry over) or a function of the request. A route's name alone
 * is not one: its `route()` is, and the editor checks it.
 */
export type RedirectTarget =
  | `/${string}` // a path, or `//host/…`
  | `${string}://${string}`
  | `${'mailto' | 'tel' | 'sms' | 'geo' | 'data' | 'urn'}:${string}`
  | RouteDef<string, any>
  | ((ctx: Context) => string)

type ContextFor<
  R extends RouteDef<string, any>,
  L extends string,
> = R['paths'] extends string
  ? Context<R['params'], L>
  : LocalizedContext<R['params'], L>

/** A redirect's status (301 by default), or that plus `only` for a redirect in some languages. */
export type RedirectOptions<L extends string> =
  RedirectStatus | { status?: RedirectStatus; only?: readonly L[] }

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
}

export interface Router<L extends string = string> {
  get: Register<L>
  post: Register<L>
  put: Register<L>
  patch: Register<L>
  delete: Register<L>

  /**
   * Declare a moved URL. The router knows it's a redirect, so tools can list
   * it or write it out for a static host. Params carry over to the target:
   *
   *   router.redirect('/', '/en')
   *   router.redirect('/consolas/:id', consoleRoute)              // 301 to the same id
   *   router.redirect(route('old-console', { es: '/es/consolas/:id', en: '/en/consoles/:id' }), consoleRoute)
   *
   *   router.redirect('/old/:id', (ctx) => `/new/${lookup(ctx.params.id)}`)
   *
   * For a page that only sometimes redirects, return `redirect()` from its loader.
   */
  redirect(
    from: `/${string}` | RouteDef<string, any>,
    to: RedirectTarget,
    options?: RedirectOptions<L>,
  ): Router<L>

  /**
   * Throw if anything declared can't work, e.g. a redirect to a route name
   * that was never registered. `keep` calls it when the server starts.
   */
  check(): void

  /** Replace the default 404 response. */
  notFound(handler: Handler): Router<L>
  /** Replace the default 500 response. */
  onError(handler: ErrorHandler): Router<L>

  /**
   * Find the most specific route for a method and pathname, or `null`.
   * When one URL belongs to several languages, `lang` picks among them.
   */
  match(method: string, pathname: string, lang?: string): Match | null
  /** The methods that have a route for this pathname (used for 405 responses). */
  allowed(pathname: string): Method[]

  /**
   * Build the URL of a named route: `router.href('console', { id: 'nes' }, 'es')`.
   * Throws if the name, a param or the language doesn't exist.
   */
  href: Link<L>
  /**
   * `ctx.link` for a language, as routes get it: a language asked for must
   * exist; otherwise this one, else the default, else any the route has.
   * keep uses it for requests no route answers (404s, errors).
   */
  linkFor(lang: string | undefined): Link<L>
  /**
   * The URL of the current page in every language it exists in, for a
   * language switcher or `hreflang` links. Empty for routes without languages.
   */
  alternates(ctx: { url: URL; lang?: string }): Partial<Record<L, string>>

  /**
   * The language of a request by `boat({ langFrom })`, or `undefined` when
   * there's no rule or it finds no declared language.
   */
  langOf(request: Request): L | undefined

  /** The languages given to `boat()`; the first one is the default. */
  readonly languages: readonly L[]
  /** Every registered route, in registration order. */
  readonly routes: readonly Route[]
  readonly notFoundHandler: Handler
  readonly errorHandler: ErrorHandler
}

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
 *   const consoleRoute = route('console', { en: '/en/console/:id', es: '/es/consola/:id' })
 *   router.get(consoleRoute, handler)
 *   consoleRoute.href({ id: 'nes' }, 'es')   // '/es/consola/nes'
 */
export function boat<const L extends string = string>(
  options?: BoatOptions<L>,
): Router<L> {
  return new BoatRouter(options)
}

/**
 * The router (pattern: facade). It reads each call and hands the work to
 * the pieces: `RouteTable` stores and finds routes, `NameBook` keeps names,
 * `Links` builds URLs, `Redirects` resolves declared redirects and
 * `Languages` reads a request's language.
 */
class BoatRouter<L extends string> implements Router<L> {
  readonly get = this.register('GET')
  readonly post = this.register('POST')
  readonly put = this.register('PUT')
  readonly patch = this.register('PATCH')
  readonly delete = this.register('DELETE')
  readonly href: Link<L>

  private readonly langs: Languages<L>
  private readonly table: RouteTable
  private readonly names = new NameBook()
  private readonly links: Links<L>
  private readonly redirects: Redirects
  private notFoundRoute: Handler = () =>
    new Response('Not Found', { status: 404 })
  private errorRoute: ErrorHandler = () =>
    new Response('Internal Server Error', { status: 500 })

  constructor(options?: BoatOptions<L>) {
    this.langs = new Languages(options?.languages ?? [], options?.langFrom)
    this.table = new RouteTable(this.langs)
    this.links = new Links(this.names, this.langs)
    this.redirects = new Redirects(this.names, this.langs)
    this.href = ((target: any, params?: any, lang?: string) =>
      this.links.href(target, params, lang)) as Link<L>
  }

  redirect(...args: unknown[]): this {
    const declared = RedirectDeclaration.read(args)
    const variants = declared.variants()
    const source = new RedirectSource(declared.label, variants)
    const resolve = this.redirects.resolverFor(declared.to, source)
    const handler = (ctx: Context) => redirect(resolve(ctx), declared.status)
    const redirectInfo = { status: declared.status, to: declared.to }
    this.add('GET', declared.registrationWith(handler), variants, redirectInfo)
    this.remember(source, declared.to)
    return this
  }

  check(): void {
    this.redirects.check()
  }

  /** Keep what `check()` and later registrations need to verify a redirect. */
  private remember(source: RedirectSource, to: RedirectTarget): void {
    const name = this.redirects.nameOf(to)
    if (name !== undefined) this.redirects.track(source, name)
  }

  notFound(handler: Handler): this {
    this.notFoundRoute = handler
    return this
  }

  onError(handler: ErrorHandler): this {
    this.errorRoute = handler
    return this
  }

  match(method: string, pathname: string, lang?: string): Match | null {
    return this.table.match(method, pathname, lang)
  }

  allowed(pathname: string): Method[] {
    return this.table.allowed(pathname)
  }

  alternates(ctx: { url: URL; lang?: string }): Partial<Record<L, string>> {
    return this.links.alternates(
      this.match('GET', ctx.url.pathname, ctx.lang),
      ctx.url,
    )
  }

  langOf(request: Request): L | undefined {
    return this.langs.of(request)
  }

  linkFor(lang: string | undefined): Link<L> {
    return this.links.bound(lang)
  }

  get languages(): readonly L[] {
    return this.langs.list
  }

  get routes(): readonly Route[] {
    return this.table.routes
  }

  get notFoundHandler(): Handler {
    return this.notFoundRoute
  }

  get errorHandler(): ErrorHandler {
    return this.errorRoute
  }

  private register(method: Method): Register<L> {
    return ((...args: unknown[]) => {
      const registration = Registration.read(args)
      this.add(method, registration, registration.variants())
      return this
    }) as Register<L>
  }

  /**
   * Check the whole registration first, then store it: a failed one leaves
   * nothing behind (no route, no name).
   */
  private add(
    method: Method,
    registration: Registration,
    variants: Variants,
    redirectInfo?: Route['redirect'],
  ): void {
    registration.ensureLanguages(variants, this.langs)
    const routes = variants
      .entries()
      .map(([lang, pattern]) =>
        this.route(method, pattern, lang, registration, redirectInfo),
      )
    this.table.ensureFree(routes)
    this.store(registration.name, variants, routes)
  }

  private store(
    name: string | undefined,
    variants: Variants,
    routes: Route[],
  ): void {
    if (name !== undefined && this.names.isNew(name, variants)) {
      this.redirects.ensureArrival(name, variants)
      this.names.add(name, variants)
    }
    if (name !== undefined) this.names.addMethod(name, routes[0]!.method)
    routes.forEach((route) => this.table.add(route))
  }

  private route(
    method: Method,
    pattern: Pattern,
    lang: string | undefined,
    registration: Registration,
    redirectInfo: Route['redirect'],
  ): Route {
    const handler: Handler = (ctx) =>
      this.answer(registration.handler, ctx, lang)
    const route: Route = {
      method,
      pattern,
      name: registration.name,
      lang,
      handler,
    }
    return redirectInfo ? { ...route, redirect: redirectInfo } : route
  }

  /**
   * Run a plain handler, or `load` then `page`. A route without languages
   * keeps the request's (from `langFrom`).
   */
  private async answer(
    handler: RouteHandler<Params, any>,
    ctx: Context,
    lang: string | undefined,
  ): Promise<Response> {
    const current = lang ?? ctx.lang
    const routeCtx = {
      ...ctx,
      lang: current,
      link: this.linkFor(current) as Link,
    }
    if (typeof handler === 'function') return handler(routeCtx)
    const data = await handler.load(routeCtx)
    if (isNotFound(data)) return this.notFoundRoute(routeCtx)
    return data instanceof Response ? data : handler.page(data, routeCtx)
  }
}

/** One call to `router.redirect(from, to, options?)`, from a path or a route(). */
class RedirectDeclaration {
  private constructor(
    private readonly from: `/${string}` | RouteDef<string, any>,
    readonly to: RedirectTarget,
    readonly status: RedirectStatus,
    private readonly only: readonly string[] | undefined,
  ) {}

  static read(args: readonly unknown[]): RedirectDeclaration {
    const [from, to, options] = args as [any, RedirectTarget, any]
    ensureSource(from)
    ensureTarget(to)
    const { status, only } = readOptions(options)
    return new RedirectDeclaration(from, to, status, only)
  }

  /** The source's name, or its path. */
  get label(): string {
    const { from } = this
    return typeof from === 'string' ? from : from.name
  }

  variants(): Variants {
    if (isRouteDef(this.from)) return Variants.of(this.from)
    return new Variants(this.label, this.from as RoutePaths)
  }

  /** The route that answers the source URLs with this redirect. */
  registrationWith(handler: Handler): Registration {
    return Registration.read([this.from, handler, { only: this.only }])
  }
}

/** A path, or a route() — a name with paths per language goes in route() too. */
function ensureSource(from: unknown): void {
  if (isRouteDef(from) || (typeof from === 'string' && from.startsWith('/')))
    return
  throw new Error(
    `boat: router.redirect moves a path starting with "/" or a route(); a name, or paths per language, go in route(): router.redirect(route('old', { en: '/old' }), to)`,
  )
}

/** A path, a full URL, a route() or a function: a route's bare name is refused, its route() says the same and is checked. */
function ensureTarget(to: unknown): void {
  if (isTarget(to)) return
  const given =
    to === undefined
      ? 'nothing was given'
      : `${JSON.stringify(to)} is none of them (a route's name: pass its route())`
  throw new Error(
    `boat: router.redirect goes to a path, a full URL, a route() or a function; ${given}`,
  )
}

function isTarget(to: unknown): boolean {
  if (typeof to === 'function' || isRouteDef(to)) return true
  return typeof to === 'string' && (to.startsWith('/') || isAbsolute(to))
}

function readOptions(options: RedirectOptions<string> | null | undefined) {
  if (options !== null && typeof options === 'object') {
    return { status: options.status ?? 301, only: options.only }
  }
  return { status: options ?? 301, only: undefined }
}

export type { RoutePaths }
