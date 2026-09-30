/**
 * Everything a handler receives. A plain object: nothing is computed lazily,
 * nothing is hidden behind getters.
 */
export interface Context<P extends Params = Params> {
  /** The standard Web `Request`, untouched. */
  request: Request
  /** `request.url`, parsed once. */
  url: URL
  /** Values captured by `:name` segments (and `*` for a trailing wildcard). */
  params: P
}

/** The context an error handler receives: the request context plus what was thrown. */
export interface ErrorContext extends Context {
  error: unknown
}

export type Params = Record<string, string>

/** A route handler always returns a standard `Response` it builds itself. */
export type Handler<P extends Params = Params> = (
  ctx: Context<P>,
) => Response | Promise<Response>

export type ErrorHandler = (ctx: ErrorContext) => Response | Promise<Response>

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
