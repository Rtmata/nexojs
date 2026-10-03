import type {
  ErrorHandler,
  Handler,
  Link,
  Params,
} from '../../shared/http/types'
import { listenWithBun, type Listening } from '../dock/bun'
import { Contexts } from './contexts'
import { FunctionRouter } from './function-router'
import { compose, hooks, type Hooks, type Middleware } from './middleware'
import { RequestFlow } from './request-flow'
import { ShadowReport } from './static/shadow-report'
import { StaticFolders, type StaticOption } from './static/static-folders'

export type { StaticMount, StaticOption } from './static/static-folders'

/**
 * What keep needs from a router. A `boat()` router fits as it is; any other
 * object with these members works too.
 */
export interface KeepRouter {
  /**
   * The route that answers a method and pathname, with its params, or `null`.
   * `lang` is the request's language when `langOf` knows it.
   */
  match(
    method: string,
    pathname: string,
    lang?: string,
  ): {
    route: { handler: Handler; pattern?: { path: string }; lang?: string }
    params: Params
  } | null
  /** The methods that have a route for this pathname (for 405 responses). */
  allowed(pathname: string): readonly string[]
  readonly notFoundHandler: Handler
  readonly errorHandler: ErrorHandler
  /**
   * Optional: `ctx.link` for a language, so every context can build links
   * (404 and error pages too). The router owns the rule; keep only asks.
   */
  linkFor?(lang: string | undefined): Link<any>
  /** Optional: the language of a request, given to `match` and to every context. */
  langOf?(request: Request): string | undefined
  /** Optional: throws when the router's setup can't work; run before listening. */
  check?(): void
}

export interface KeepOptions {
  /**
   * Who answers requests: usually `boat()`, any object meeting `KeepRouter`,
   * or — with no router at all — one function `(request) => Response`.
   * keep still adds middlewares, the trailing-slash redirect and error
   * safety around a function.
   */
  router: KeepRouter | ((request: Request) => Response | Promise<Response>)
  /**
   * Files served when no route matches (GET and HEAD). A folder is served
   * from the site root (`'./public'`: `public/logo.png` → `/logo.png`); give
   * `{ dir, at }` to serve one under a path, or a list of both. Routes always
   * win; files hidden by a route are reported when the server starts.
   *
   *   static: ['./public', { dir: './data/covers', at: '/covers' }]
   */
  static?: StaticOption
  /**
   * Seconds a connection may stay silent before it's closed: 120 by default,
   * up to 255; 0 never closes. A stream (server-sent events) sending a
   * heartbeat more often than this stays open.
   */
  idleTimeout?: number
}

export interface StopOptions {
  /** How long requests in progress may take to finish, in ms (default 5000). */
  grace?: number
}

export interface Server {
  /**
   * Wrap every request with a middleware, or with `{ onRequest, onResponse }`
   * hooks. The first one added is the outermost.
   */
  use(middleware: Middleware | Hooks): Server
  /** Answer a single request. Needs no network: handy for tests. */
  fetch(request: Request): Promise<Response>
  /** Check the setup, then start listening on a port. */
  listen(port?: number): Promise<Server>
  /**
   * Stop listening: no new requests, and those in progress get `grace` ms
   * (5000 by default) to finish before their connections are closed, so an
   * endless stream (server-sent events) never keeps the server up.
   */
  stop(options?: StopOptions): Promise<void>
}

/**
 * Create a server.
 *
 *   keep({ router: boat(), static: './public' }).listen(3000)
 *   keep({ router: (request) => new Response('hi') }).listen(3000)
 *
 * `router` is usually `boat()`, but keep only needs the few members of
 * `KeepRouter`, so it works with any router — or none, with a function.
 * What happens to each request is described in `RequestFlow`.
 */
export function keep(options: KeepOptions): Server {
  return new KeepServer(options)
}

/**
 * The server (pattern: facade): middlewares around the request flow, the
 * static folders, and listening.
 */
class KeepServer implements Server {
  private readonly router: KeepRouter
  private readonly folders: StaticFolders
  private readonly contexts: Contexts
  private readonly flow: RequestFlow
  private readonly middlewares: Middleware[] = []
  /** The middlewares composed around the flow, rebuilt only after `use()`. */
  private chain: Handler | null = null
  private running: Listening | null = null
  /** While `listen()` prepares: a second call fails, and `stop()` waits for it. */
  private starting: Promise<Listening> | null = null
  private readonly idleTimeout: number

  constructor(options: KeepOptions) {
    const { router } = options
    this.router =
      typeof router === 'function' ? new FunctionRouter(router) : router
    this.folders = new StaticFolders(options.static)
    this.contexts = new Contexts(this.router)
    this.flow = new RequestFlow(this.router, this.folders, this.contexts)
    this.idleTimeout = options.idleTimeout ?? 120
  }

  use(middleware: Middleware | Hooks): this {
    this.middlewares.push(
      typeof middleware === 'function' ? middleware : hooks(middleware),
    )
    this.chain = null
    return this
  }

  async fetch(request: Request): Promise<Response> {
    const response = await this.respond(request)
    if (request.method !== 'HEAD') return response
    await response.body?.cancel() // so a stream's cleanup runs (timers, files)
    return new Response(null, {
      status: response.status,
      headers: response.headers,
    })
  }

  async listen(port = 3000): Promise<this> {
    this.ensureCanListen()
    this.starting = this.start(port)
    try {
      this.running = await this.starting
      return this
    } finally {
      this.starting = null
    }
  }

  /** Index the folders, then listen. A failure (port taken…) leaves nothing watched. */
  private async start(port: number): Promise<Listening> {
    try {
      await this.prepareFolders()
      const fetch = (request: Request) => this.fetch(request)
      const running = listenWithBun(fetch, port, this.idleTimeout)
      console.log(`keep: listening on ${running.url}`)
      return running
    } catch (error) {
      this.folders.stop()
      throw error
    }
  }

  /** Not listening yet, and the router's setup can work. */
  private ensureCanListen(): void {
    this.router.check?.()
    if (!this.running && !this.starting) return
    throw new Error(
      'keep: this server is already listening (or starting); call stop() before listening again',
    )
  }

  /** Check and index the static folders, and report what they can't serve. */
  private async prepareFolders(): Promise<void> {
    await this.folders.ensureExist()
    await this.folders.start()
    await new ShadowReport(this.router, this.folders.mounts).print()
  }

  async stop({ grace = 5000 }: StopOptions = {}): Promise<void> {
    await this.starting?.catch(() => null) // a listen() under way finishes first
    this.folders.stop()
    const running = this.running
    this.running = null
    if (running && !(await settlesWithin(running.stop(false), grace)))
      await running.stop(true)
  }

  /**
   * The last line of defense: a Response thrown by a middleware or hook is
   * still an answer; anything else becomes a plain 500.
   */
  private async respond(request: Request): Promise<Response> {
    try {
      return await this.handler()(this.contexts.forRequest(request))
    } catch (error) {
      if (error instanceof Response) return error
      console.error(
        'keep: a middleware or the error handler itself threw\n',
        error,
      )
      return new Response('Internal Server Error', { status: 500 })
    }
  }

  private handler(): Handler {
    return (this.chain ??= compose(this.middlewares, (ctx) =>
      this.flow.run(ctx),
    ))
  }
}

/**
 * Whether `promise` resolves within `ms`: a rejection counts as not done,
 * so the caller can still force its way. The timer never outlives it.
 */
async function settlesWithin(promise: Promise<unknown>, ms: number) {
  const timeout = new Timeout(ms)
  const done = promise.then(
    () => true,
    () => false,
  )
  const settled = await Promise.race([done, timeout.over])
  timeout.cancel() // neither branch can throw: both are caught above
  return settled
}

/** A promise that answers `false` after `ms`, unless cancelled first. */
class Timeout {
  readonly over: Promise<false>
  private timer: ReturnType<typeof setTimeout> | undefined

  constructor(ms: number) {
    this.over = new Promise((done) => {
      this.timer = setTimeout(done, ms, false)
    })
  }

  cancel(): void {
    clearTimeout(this.timer)
  }
}
