import type { Context, Handler } from '../../shared/http/types'

/**
 * A middleware is a function that wraps a handler and returns a new one.
 * Nothing more: no `next`, no registry. The same middleware works for the
 * whole server (`server.use(mw)`) or for a single route (`router.get(path, mw(handler))`).
 *
 *   const timer: Middleware = (handler) => async (ctx) => {
 *     const start = Date.now()
 *     const response = await handler(ctx)
 *     console.log(`${ctx.url.pathname} ${Date.now() - start}ms`)
 *     return response
 *   }
 */
export type Middleware = (handler: Handler) => Handler

export interface Hooks {
  /** Runs before the handler. Return a `Response` to answer right away and skip it. */
  onRequest?: (ctx: Context) => void | Response | Promise<void | Response>
  /** Runs after the handler with its response. Return the response to send. */
  onResponse?: (
    ctx: Context,
    response: Response,
  ) => Response | Promise<Response>
}

/**
 * Build a middleware from named hooks — a shortcut for the common
 * "before / after" case. It is just a `Middleware`; read it to see how.
 *
 *   server.use(hooks({
 *     onRequest: (ctx) => (ctx.url.pathname === '/health' ? new Response('ok') : undefined),
 *     onResponse: (ctx, response) => { response.headers.set('x-museum', 'GR'); return response },
 *   }))
 */
export function hooks({ onRequest, onResponse }: Hooks): Middleware {
  return (handler) => async (ctx) => {
    const early = await onRequest?.(ctx)
    if (early) return early
    const response = await handler(ctx)
    return onResponse ? onResponse(ctx, response) : response
  }
}

/**
 * Wrap a handler with middlewares. The first one is the outermost:
 * `compose([a, b], h)` is `a(b(h))`.
 */
export function compose(middlewares: Middleware[], handler: Handler): Handler {
  return middlewares.reduceRight(
    (inner, middleware) => middleware(inner),
    handler,
  )
}
