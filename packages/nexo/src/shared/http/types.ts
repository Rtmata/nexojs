/**
 * Internal, not a public module: the contract every server piece shares —
 * what a request handler receives and returns, and what a declared route
 * looks like to the type checker. boat, keep and witness all build on it
 * without depending on each other; boat re-exports it as public API.
 */

/**
 * Everything a handler receives. A plain object: nothing is computed lazily,
 * nothing is hidden behind getters.
 */
export interface Context<P extends Params = Params, L extends string = string> {
  /** The standard Web `Request`, untouched. */
  request: Request
  /** `request.url`, parsed once. */
  url: URL
  /** Values captured by `:name` segments (and `*` for a trailing wildcard). */
  params: P
  /**
   * The language of the request: the route variant that matched (`'es'`
   * when `/es/consola/:id` answered), else what `boat({ langFrom })` read
   * from the request. Undefined when neither knows.
   */
  lang?: L
  /** Build a link to a named route, in this request's language by default. */
  link: Link<L>
}

/** The context of a route declared per language: `lang` is always there. */
export type LocalizedContext<
  P extends Params = Params,
  L extends string = string,
> = Context<P, L> & { lang: L }

/** The context an error handler receives: the request context plus what was thrown. */
export interface ErrorContext extends Context {
  error: unknown
}

export type Params = Record<string, string>

/** Values accepted when building a link: numbers are written as text. */
export type LinkParams = Record<string, string | number>

/**
 * A route handler always returns a standard `Response` it builds itself.
 * Throwing a `Response` ends the request with it too.
 */
export type Handler<P extends Params = Params, C = Context<P>> = (
  ctx: C,
) => Response | Promise<Response>

export type ErrorHandler = (ctx: ErrorContext) => Response | Promise<Response>

/**
 * A route split in two: `load` gets the data, `page` turns it into a
 * `Response`. A `Response` returned (or thrown) by `load` ends the request
 * there and `page` never runs — that's how a loader says 404 or redirects.
 */
export interface PageRoute<D, C> {
  load(ctx: C): D | Response | Promise<D | Response>
  page(data: D, ctx: C): Response | Promise<Response>
}

/** Either form a route accepts. */
export type RouteHandler<P extends Params, C = Context<P>, D = any> =
  Handler<P, C> | PageRoute<D, C>

/**
 * Build the URL of a named route or of a `route()` definition. With a
 * language, a `route()`'s params are checked against that language's path;
 * without one (the current language), against what every path takes.
 */
export interface Link<L extends string = string> {
  <R extends RouteDef<string, any>, const Lang extends L>(
    route: R,
    params: ParamsIn<R['paths'], Lang> | undefined,
    lang: Lang,
  ): string
  <R extends RouteDef<string, any>>(
    route: R,
    params?: ParamsForAll<R['paths']>,
  ): string
  (name: string, params?: LinkParams, lang?: L): string
}

/** The params a link must give to fit every path of a route. */
type ParamsForAll<Paths extends RoutePaths> = Intersection<
  ParamsIn<Paths, LanguagesOf<Paths>>
>

type Intersection<U> = (U extends unknown ? (u: U) => void : never) extends (
  i: infer I,
) => void
  ? I
  : never

/** The HTTP methods a route can be registered for. `HEAD` is answered from `GET`. */
export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/**
 * Turns a path literal into the type of its params, so `params.id` is known
 * at compile time:
 *
 *   PathParams<'/consola/:id/juegos/*'>  →  { id: string; '*': string }
 *
 * Types only — this never exists at runtime.
 */
export type PathParams<Path extends string> =
  Path extends `${infer Head}/${infer Tail}`
    ? SegmentParam<Head> & PathParams<Tail>
    : SegmentParam<Path>

type SegmentParam<Segment extends string> = Segment extends `:${infer Name}`
  ? { [K in Name]: string }
  : Segment extends '*'
    ? { '*': string }
    : {}

/** One path, or one path per language. */
export type RoutePaths = string | Readonly<Record<string, string>>

/** The params a route's paths capture, typed from the path text. */
export type ParamsOf<Paths extends RoutePaths> = Paths extends string
  ? PathParams<Paths>
  : PathParams<Paths[keyof Paths] & string>

/** The languages a route is declared in (`never` for a single path). */
export type LanguagesOf<Paths extends RoutePaths> = Paths extends string
  ? never
  : keyof Paths & string

/** The params of the path in one language (of the path, for a single one). */
export type ParamsIn<
  Paths extends RoutePaths,
  Lang extends string,
> = Paths extends string
  ? PathParams<Paths>
  : PathParams<Paths[Lang & keyof Paths] & string>

/** `href` asks for params only when the path has some, and for a language only when there are several. */
type HrefArgs<P, L extends string> = [L] extends [never]
  ? {} extends P
    ? [params?: P]
    : [params: P]
  : {} extends P
    ? [params: P | undefined, lang: L]
    : [params: P, lang: L]

/**
 * A route declared on its own, so links to it are checked by the editor and
 * any file can build them without the router:
 *
 *   export const consoleRoute = route('console', {
 *     es: '/es/consola/:id',
 *     en: '/en/console/:id',
 *   })
 *
 *   consoleRoute.href({ id: 'nes' }, 'es')   // '/es/consola/nes'
 *   router.get(consoleRoute, handler)        // registered like any route
 *
 * It's a plain object: `href` only fills in the paths written here.
 */
export interface RouteDef<N extends string, Paths extends RoutePaths> {
  readonly name: N
  readonly paths: Paths
  /** Types only: the params `href` expects. */
  readonly params: ParamsOf<Paths>
  /** The params checked against the path of the language given: `:slug` in 'es', `:id` in 'en'. */
  href<const Lang extends LanguagesOf<Paths>>(
    ...args: HrefArgs<ParamsIn<Paths, Lang>, Lang>
  ): string
}
