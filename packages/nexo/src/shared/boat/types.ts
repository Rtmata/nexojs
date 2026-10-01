import type { RouteDef } from './route'

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
   * The language of the route variant that matched: `'es'` when
   * `/es/consola/:id` answered. Undefined for routes without languages.
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

/** Build the URL of a named route or of a `route()` definition. */
export interface Link<L extends string = string> {
  <R extends RouteDef<string, any>>(
    route: R,
    params?: R['params'],
    lang?: L,
  ): string
  (name: string, params?: LinkParams, lang?: L): string
}

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
