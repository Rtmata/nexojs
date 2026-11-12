import type {
  ErrorHandler,
  Handler,
  Link,
  Params,
} from '../../shared/http/types'
import { listenWithBun, type Listening } from '../dock/bun'
import { Contexts } from './contexts'
import {
  securityHeaders,
  type SecurityHeadersOptions,
} from './security-headers'
import { idempotency, type IdempotencyOptions } from './idempotency'
import { FunctionRouter } from './function-router'
import { csrf, type CsrfOptions } from './csrf'
import { compose, hooks, type Hooks, type Middleware } from './middleware'
import { RequestFlow } from './request-flow'
import { ShadowReport } from './static/shadow-report'
import { StaticFolders, type StaticOption } from './static/static-folders'

type Startup = NonNullable<Hooks['onStart']>

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
   * Milliseconds a connection may stay silent before it's closed: two
   * minutes (`2 * 60 * 1000`) by default, up to 255 seconds (Bun's limit,
   * rounded up to whole seconds); 0 never closes. A stream (server-sent
   * events) sending a heartbeat more often than this stays open.
   */
  idleTimeout?: number
  /**
   * Whether requests that change something must come from this site (see
   * `csrf`): on by default, `false` turns it off, an object tunes it.
   */
  csrf?: false | CsrfOptions
  /**
   * The headers every response carries to tell the browser what it may do
   * with it (see `securityHeaders`): on by default, `false` turns them off, an
   * object tunes them or adds a Content Security Policy.
   */
  securityHeaders?: false | SecurityHeadersOptions
  /**
   * A request sent twice with the same `Idempotency-Key` is answered once
   * (see `idempotency`): on by default, `false` turns it off (a proxy that
   * already does it), an object tunes how long and where answers are kept.
   */
  idempotency?: false | IdempotencyOptions
}

export interface StopOptions {
  /** How long requests in progress may take to finish, in ms (default 5000). */
  grace?: number
}

export interface Server {
  /**
   * Wrap every request with a middleware, or with `{ onRequest, onResponse }`
   * hooks. The first one added is the outermost. Hooks may also bring an
   * `onStart`, run by `listen()` before the port opens.
   */
  use(middleware: Middleware | Hooks): Server
  /** Answer a single request. Needs no network: handy for tests. */
  fetch(request: Request): Promise<Response>
  /** Check the setup, then start listening on a port (`0` picks a free one: see `url`); `signal` stops it (as `stop()`). */
  listen(port?: number, options?: { signal?: AbortSignal }): Promise<Server>
  /** Where the server listens, once it does; null before `listen()` and after `stop()`. */
  readonly url: URL | null
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
 *
 * keep sends bytes as they are: no gzip, no brotli. In production, put a
 * reverse proxy in front (Caddy compresses by default; nginx with `gzip
 * on`) — it also terminates TLS. keep's ETags are weak, so one a proxy
 * rewrites after compressing still matches (see `shared/http/etag`).
 */
export function keep(options: KeepOptions): Server {
  return new KeepServer(options)
}

/**
 * The server (pattern: facade): middlewares around the request flow
 * (security headers outermost so every answer gets them, then csrf, unless
 * turned off; then idempotency, unless turned off), the static folders, and listening.
 */
class KeepServer implements Server {
  private readonly router: KeepRouter
  private readonly folders: StaticFolders
  private readonly contexts: Contexts
  private readonly flow: RequestFlow
  private readonly middlewares: Middleware[] = []
  /** What `listen()` runs first, in the order added. */
  private readonly startups: Startup[] = []
  /** The middlewares composed around the flow, rebuilt only after `use()`. */
  private chain: Handler | null = null
  private running: Listening | null = null
  /** While `listen()` prepares: a second call fails, and `stop()` waits for it. */
  private starting: Promise<Listening> | null = null
  private readonly idleTimeout: number
  /** Ends the listener on `listen()`'s signal, if one was given. */
  private unwatch: AbortController | null = null

  constructor(options: KeepOptions) {
    const { router } = options
    this.router =
      typeof router === 'function' ? new FunctionRouter(router) : router
    this.folders = new StaticFolders(options.static)
    this.contexts = new Contexts(this.router)
    this.flow = new RequestFlow(this.router, this.folders, this.contexts)
    this.idleTimeout = bunSeconds(options.idleTimeout ?? 2 * 60 * 1000)
    this.middlewares.push(...safeguards(options))
  }

  get url(): URL | null {
    return this.running?.url ?? null
  }

  use(middleware: Middleware | Hooks): this {
    if (typeof middleware === 'function') this.middlewares.push(middleware)
    else this.useHooks(middleware)
    this.chain = null
    return this
  }

  private useHooks(added: Hooks): void {
    this.middlewares.push(hooks(added))
    if (added.onStart) this.startups.push(added.onStart)
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

  async listen(
    port = 3000,
    options: { signal?: AbortSignal } = {},
  ): Promise<this> {
    this.ensureCanListen()
    this.starting = this.start(port)
    try {
      this.running = await this.starting
      this.stopsWith(options.signal)
      return this
    } finally {
      this.starting = null
    }
  }

  /** The `{ signal }` rule: aborting stops the server, as `stop()` does. The listener goes with `stop()`: a later abort must not stop the next `listen()`. */
  private stopsWith(signal?: AbortSignal): void {
    if (signal?.aborted) return this.stopOnAbort()
    this.unwatch = new AbortController()
    const options = { once: true, signal: this.unwatch.signal }
    signal?.addEventListener('abort', () => this.stopOnAbort(), options)
  }

  /** Nobody awaits a stop an abort asked for: its failure is reported, not dropped. */
  private stopOnAbort(): void {
    this.stop().catch((error) =>
      console.error('keep: stopping on abort failed\n', error),
    )
  }

  /** Run the start hooks, index the folders, then listen. A failure (port taken…) leaves nothing watched. */
  private async start(port: number): Promise<Listening> {
    try {
      await this.runStartups()
      await this.prepareFolders()
      return this.open(port)
    } catch (error) {
      this.folders.stop()
      throw error
    }
  }

  private open(port: number): Listening {
    const fetch = (request: Request) => this.fetch(request)
    const running = listenWithBun(fetch, port, this.idleTimeout)
    console.log(`keep: listening on ${running.url}`)
    return running
  }

  /** The `onStart` hooks, in the order added; one that throws stops the start. */
  private async runStartups(): Promise<void> {
    for (const startup of this.startups) await startup()
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
    this.unwatch?.abort()
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

/** Bun's longest idle timeout, in seconds. */
const BUN_IDLE_LIMIT = 255

/** Nexo times are milliseconds; Bun counts whole seconds. */
function bunSeconds(ms: number): number {
  const seconds = Math.ceil(ms / 1000)
  // NaN fails the first test, Infinity the second.
  if (ms >= 0 && seconds <= BUN_IDLE_LIMIT) return seconds
  throw new RangeError(
    `keep: idleTimeout is in milliseconds, from 0 to ${BUN_IDLE_LIMIT * 1000} (Bun's limit), got ${ms}`,
  )
}

/** keep's own middlewares, outermost first, each unless turned off with `false`. */
function safeguards(options: KeepOptions): Middleware[] {
  return [
    ...(options.securityHeaders === false
      ? []
      : [securityHeaders(options.securityHeaders)]),
    ...(options.csrf === false ? [] : [csrf(options.csrf)]),
    ...(options.idempotency === false
      ? []
      : [idempotency(options.idempotency)]),
  ]
}
