import { readdir, stat } from 'node:fs/promises'
import { join, sep } from 'node:path'
import type {
  Context,
  ErrorHandler,
  Handler,
  Link,
  Params,
} from '../../shared/boat'
import { listenWithBun } from '../dock/bun'
import { serveFile } from './files'
import { compose, type Middleware } from './middleware'

/**
 * What keep needs from a router. A `boat()` router fits as it is; any other
 * object with these members works too.
 */
export interface KeepRouter {
  /** The route that answers a method and pathname, with its params, or `null`. */
  match(
    method: string,
    pathname: string,
  ): {
    route: { handler: Handler; pattern?: { path: string } }
    params: Params
  } | null
  /** The methods that have a route for this pathname (for 405 responses). */
  allowed(pathname: string): readonly string[]
  readonly notFoundHandler: Handler
  readonly errorHandler: ErrorHandler
  /** Optional: lets every context build links with `ctx.link`. */
  href?: Link<any>
}

export type KeepOptions =
  | {
      router: KeepRouter
      /**
       * A folder served from the site root, as a fallback when no route matches:
       * `public/logo.png` → `/logo.png`. Routes always win; files hidden by a
       * route are reported when the server starts.
       */
      static?: string
    }
  | {
      /**
       * Layer 0: one function answers every request, no router at all.
       * keep still adds middlewares, the trailing-slash redirect and error
       * safety around it.
       */
      fetch: (request: Request) => Response | Promise<Response>
      static?: never
    }

export interface Server {
  /** Wrap every request with a middleware. The first one added is the outermost. */
  use(middleware: Middleware): Server
  /** Answer a single request. Needs no network: handy for tests. */
  fetch(request: Request): Promise<Response>
  /** Check the setup, then start listening on a port. */
  listen(port?: number): Promise<Server>
  /** Stop listening. */
  stop(): Promise<void>
}

/**
 * Create a server.
 *
 *   keep({ router, static: './public' }).listen(3000)
 *   keep({ fetch: (request) => new Response('hi') }).listen(3000)
 *
 * `router` is usually `boat()`, but keep only needs the few members of
 * `KeepRouter`, so it works with any router — or none, through `fetch`.
 *
 * What happens to every request, in order:
 *   1. a trailing slash is redirected away (301)
 *   2. the router's most specific route answers
 *   3. otherwise, a file from the `static` folder (GET and HEAD only)
 *   4. otherwise, 405 if the path exists for other methods, or the router's 404
 * Steps 1–4 run inside the middlewares. A `Response` thrown there is sent
 * as the answer; anything else thrown goes to the router's error handler,
 * and the server keeps running.
 */
export function keep(options: KeepOptions): Server {
  const router = 'router' in options ? options.router : fromFetch(options.fetch)
  const staticFolder = 'router' in options ? options.static : undefined
  const middlewares: Middleware[] = []
  let running: { stop: () => Promise<void> } | null = null

  const core: Handler = async (ctx) => {
    try {
      return await answer(ctx)
    } catch (error) {
      // A thrown Response is an answer, not a failure: a helper deep inside a
      // loader can `throw router.notFoundHandler(ctx)` to end the request.
      if (error instanceof Response) return error
      console.error(
        `keep: error while handling ${ctx.request.method} ${ctx.url.pathname}\n`,
        error,
      )
      return router.errorHandler({ ...ctx, error })
    }
  }

  async function answer(ctx: Context): Promise<Response> {
    const { request, url } = ctx

    if (url.pathname !== '/' && url.pathname.endsWith('/')) {
      const target = new URL(url)
      target.pathname = url.pathname.replace(/\/+$/, '') || '/'
      return Response.redirect(target, 301)
    }

    // HEAD is answered by the GET route; the body is dropped at the end.
    const method = request.method === 'HEAD' ? 'GET' : request.method
    const found = router.match(method, url.pathname)
    if (found) return found.route.handler({ ...ctx, params: found.params })

    if (staticFolder && method === 'GET') {
      const file = await serveFile(staticFolder, decodePath(url.pathname))
      if (file) return file
    }

    const allowed = [...router.allowed(url.pathname)]
    if (allowed.length > 0) {
      if (allowed.includes('GET')) allowed.push('HEAD')
      return new Response('Method Not Allowed', {
        status: 405,
        headers: { allow: allowed.join(', ') },
      })
    }

    return router.notFoundHandler(ctx)
  }

  const server: Server = {
    use(middleware) {
      middlewares.push(middleware)
      return server
    },

    async fetch(request) {
      const ctx: Context = {
        request,
        url: new URL(request.url),
        params: {},
        link: router.href ?? noLinks,
      }
      let response: Response
      try {
        response = await compose(middlewares, core)(ctx)
      } catch (error) {
        // A middleware itself failed: the last line of defense.
        console.error('keep: a middleware threw\n', error)
        response = new Response('Internal Server Error', { status: 500 })
      }
      if (request.method === 'HEAD') {
        return new Response(null, {
          status: response.status,
          headers: response.headers,
        })
      }
      return response
    },

    async listen(port = 3000) {
      if (staticFolder) await checkStaticFolder(router, staticFolder)
      const listening = listenWithBun(server.fetch, port)
      running = listening
      console.log(`keep: listening on ${listening.url}`)
      return server
    },

    async stop() {
      await running?.stop()
      running = null
    },
  }

  return server
}

/** `keep({ fetch })`: a router of one route that answers everything. */
function fromFetch(
  fetch: (request: Request) => Response | Promise<Response>,
): KeepRouter {
  return {
    match: () => ({
      route: { handler: (ctx) => fetch(ctx.request) },
      params: {},
    }),
    allowed: () => [],
    notFoundHandler: () => new Response('Not Found', { status: 404 }),
    errorHandler: () => new Response('Internal Server Error', { status: 500 }),
  }
}

const noLinks = (() => {
  throw new Error(
    'keep: ctx.link needs a router that can build links, like boat()',
  )
}) as Link

/**
 * Report, once at startup, a missing static folder or files that can never be
 * served because a route answers their URL first.
 */
async function checkStaticFolder(router: KeepRouter, folder: string) {
  const info = await stat(folder).catch(() => null)
  if (!info?.isDirectory()) {
    console.warn(`⚠ keep: static folder "${folder}" does not exist`)
    return
  }

  const shadowed: string[] = []
  for (const entry of await readdir(folder, { recursive: true })) {
    if (!(await stat(join(folder, entry))).isFile()) continue
    const urlPath = '/' + entry.split(sep).join('/')
    const found = router.match('GET', urlPath)
    if (found) {
      shadowed.push(
        `    ${join(folder, entry)}  →  ${urlPath}  (route: GET ${found.route.pattern?.path ?? '?'})`,
      )
    }
  }

  if (shadowed.length > 0) {
    const count =
      shadowed.length === 1
        ? '1 static file is'
        : `${shadowed.length} static files are`
    console.warn(
      `⚠ keep: ${count} shadowed by a route and will never be served:\n${shadowed.join('\n')}`,
    )
  }
}

function decodePath(pathname: string): string {
  try {
    return decodeURIComponent(pathname)
  } catch {
    return pathname
  }
}
