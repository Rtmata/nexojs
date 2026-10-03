import { Languages, type LangFrom } from './language'
import { Links } from './links'
import { NameBook } from './name-book'
import type { Pattern } from './pattern'
import { redirect, type RedirectStatus } from './redirect'
import { RedirectSource, Redirects } from './redirects'
import { Registration } from './registration'
import {
  isPathsObject,
  isRouteDef,
  Variants,
  type RouteDef,
  type RoutePaths,
} from './route'
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
 * Where a declared redirect goes: a fixed path, a route name, a `route()`
 * (params carry over) or a function of the request.
 */
export type RedirectTarget =
  string | RouteDef<string, any> | ((ctx: Context) => string)

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

  /**
   * Declare a moved URL. The router knows it's a redirect, so tools can list
   * it or write it out for a static host. Params carry over to the target:
   *
   *   router.redirect('/', '/en')
   *   router.redirect('/consolas/:id', consoleRoute)              // 301 to the same id
   *   router.redirect('old-console', { es: '/es/consolas/:id', en: '/en/consoles/:id' }, consoleRoute)
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
  redirect(
    name: string,
    paths: { readonly [K in L]?: string },
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
 *   router.get('console', { en: '/en/console/:id', es: '/es/consola/:id' }, handler)
 *   router.href('console', { id: 'nes' }, 'es')   // '/es/consola/nes'
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
    return data instanceof Response ? data : handler.page(data, routeCtx)
  }
}

/**
 * One call to `router.redirect(...)`, read into its parts:
 *   (from, to, options?)                 from = '/path' or route()
 *   (name, paths per language, to, options?)
 */
class RedirectDeclaration {
  private constructor(
    private readonly source: readonly unknown[],
    readonly to: RedirectTarget,
    readonly status: RedirectStatus,
    private readonly only: readonly string[] | undefined,
  ) {}

  static read(args: readonly unknown[]): RedirectDeclaration {
    const perLanguage = typeof args[0] === 'string' && !args[0].startsWith('/')
    if (perLanguage) ensurePathsGiven(args[0] as string, args[1])
    const source = args.slice(0, perLanguage ? 2 : 1)
    const [to, options] = args.slice(source.length) as [RedirectTarget, any]
    if (to === undefined)
      throw new Error(
        "boat: router.redirect needs somewhere to go. Give a path, a route name, a route() or a function: router.redirect('/old', '/new')",
      )
    const { status, only } = readOptions(options)
    return new RedirectDeclaration(source, to, status, only)
  }

  /** The source's name, or its path. */
  get label(): string {
    const [first] = this.source
    return isRouteDef(first) ? first.name : String(first)
  }

  variants(): Variants {
    const [first, second] = this.source
    if (isRouteDef(first)) return Variants.of(first)
    return new Variants(this.label, (second ?? first) as RoutePaths)
  }

  /** The route that answers the source URLs with this redirect. */
  registrationWith(handler: Handler): Registration {
    return Registration.read([...this.source, handler, { only: this.only }])
  }
}

function ensurePathsGiven(name: string, paths: unknown): void {
  if (isPathsObject(paths)) return
  throw new Error(
    `boat: router.redirect("${name}", …) needs a path starting with "/", a route(), or a name followed by its paths per language`,
  )
}

function readOptions(options: RedirectOptions<string> | null | undefined) {
  if (options !== null && typeof options === 'object') {
    return { status: options.status ?? 301, only: options.only }
  }
  return { status: options ?? 301, only: undefined }
}

export type { RoutePaths }
