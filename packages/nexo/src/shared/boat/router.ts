import {
  compareSpecificity,
  matchPattern,
  parsePattern,
  shapeOf,
  splitPath,
  type Pattern,
} from './pattern'
import type { ErrorHandler, Handler, Method, Params, PathParams } from './types'

export interface Route {
  method: Method
  pattern: Pattern
  handler: Handler
}

/** The result of a successful lookup: which route answered and what it captured. */
export interface Match {
  route: Route
  params: Params
}

export interface Router {
  get<P extends string>(path: P, handler: Handler<PathParams<P>>): Router
  post<P extends string>(path: P, handler: Handler<PathParams<P>>): Router
  put<P extends string>(path: P, handler: Handler<PathParams<P>>): Router
  patch<P extends string>(path: P, handler: Handler<PathParams<P>>): Router
  delete<P extends string>(path: P, handler: Handler<PathParams<P>>): Router

  /** Replace the default 404 response. */
  notFound(handler: Handler): Router
  /** Replace the default 500 response. */
  onError(handler: ErrorHandler): Router

  /** Find the most specific route for a method and pathname, or `null`. */
  match(method: string, pathname: string): Match | null
  /** The methods that have a route for this pathname (used for 405 responses). */
  allowed(pathname: string): Method[]

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
 */
export function boat(): Router {
  const routes: Route[] = []
  let notFoundHandler = defaultNotFound
  let errorHandler = defaultError

  function add(method: Method, path: string, handler: Handler): Router {
    const pattern = parsePattern(path)
    const shape = shapeOf(pattern)
    const clash = routes.find(
      (r) => r.method === method && shapeOf(r.pattern) === shape,
    )
    if (clash) {
      throw new Error(
        `boat: ${method} "${path}" and ${method} "${clash.pattern.path}" match exactly the same URLs`,
      )
    }
    routes.push({ method, pattern, handler })
    return router
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

  const router: Router = {
    get: (path, handler) => add('GET', path, handler as Handler),
    post: (path, handler) => add('POST', path, handler as Handler),
    put: (path, handler) => add('PUT', path, handler as Handler),
    patch: (path, handler) => add('PATCH', path, handler as Handler),
    delete: (path, handler) => add('DELETE', path, handler as Handler),

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
