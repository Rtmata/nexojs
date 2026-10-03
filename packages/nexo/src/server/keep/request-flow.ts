import type { Context } from '../../shared/http/types'
import type { Contexts } from './contexts'
import type { KeepRouter } from './keep'
import type { StaticFolders } from './static/static-folders'

/** A request on its way: the context so far, updated when a route answers. */
interface Visit {
  ctx: Context
  /** GET for HEAD requests: they're answered by the GET route, body dropped later. */
  method: string
}

/** One step of the flow: an answer, or `null` to let the next step try. */
interface Step {
  answer(visit: Visit): Response | null | Promise<Response | null>
}

/**
 * What happens to every request, in order (pattern: chain of responsibility):
 *   1. a trailing slash is redirected away (301; 308 for other methods)
 *   2. the router's most specific route answers
 *   3. otherwise, a file from the static folders (GET and HEAD only)
 *   4. otherwise, 405 if the path exists for other methods
 *   5. otherwise, the router's 404
 * A `Response` thrown along the way is the answer; anything else thrown goes
 * to the router's error handler, with the context of the route that failed.
 */
export class RequestFlow {
  private readonly steps: readonly Step[]

  constructor(
    private readonly router: KeepRouter,
    folders: StaticFolders,
    contexts: Contexts,
  ) {
    this.steps = [
      new TrailingSlash(),
      new RouteStep(router, contexts),
      new StaticStep(folders),
      new MethodNotAllowed(router),
      new NotFound(router),
    ]
  }

  async run(ctx: Context): Promise<Response> {
    const visit = {
      ctx,
      method: ctx.request.method === 'HEAD' ? 'GET' : ctx.request.method,
    }
    try {
      return await this.walk(visit)
    } catch (error) {
      return this.failed(error, visit)
    }
  }

  private async walk(visit: Visit): Promise<Response> {
    for (const step of this.steps) {
      const response = await step.answer(visit)
      if (response) return response
    }
    throw new Error('keep: no step answered') // NotFound always answers
  }

  /**
   * A thrown Response is an answer, not a failure: a helper deep inside a
   * loader can `throw router.notFoundHandler(ctx)` to end the request.
   */
  private failed(error: unknown, visit: Visit): Response | Promise<Response> {
    if (error instanceof Response) return error
    const { request, url } = visit.ctx
    console.error(
      `keep: error while handling ${request.method} ${url.pathname}\n`,
      error,
    )
    return this.router.errorHandler({ ...visit.ctx, error })
  }
}

class TrailingSlash implements Step {
  answer(visit: Visit): Response | null {
    const { ctx } = visit
    const { pathname } = ctx.url
    if (pathname === '/' || !pathname.endsWith('/')) return null
    const target = new URL(ctx.url)
    target.pathname = pathname.replace(/\/+$/, '') || '/'
    // 308 keeps the method and body: a POST to /x/ must not become a GET.
    return Response.redirect(target, visit.method === 'GET' ? 301 : 308)
  }
}

/** The route answers with the route's language, so an error page gets it too. */
class RouteStep implements Step {
  constructor(
    private readonly router: KeepRouter,
    private readonly contexts: Contexts,
  ) {}

  answer(visit: Visit): Response | Promise<Response> | null {
    const { ctx } = visit
    const found = this.router.match(visit.method, ctx.url.pathname, ctx.lang)
    if (!found) return null
    const lang = found.route.lang ?? ctx.lang
    const link = lang === ctx.lang ? ctx.link : this.contexts.link(lang)
    visit.ctx = { ...ctx, params: found.params, lang, link }
    return found.route.handler(visit.ctx)
  }
}

class StaticStep implements Step {
  constructor(private readonly folders: StaticFolders) {}

  answer({ ctx, method }: Visit): Promise<Response | null> | null {
    if (method !== 'GET') return null
    const range = ctx.request.headers.get('range')
    return this.folders.serve(ctx.url.pathname, range)
  }
}

class MethodNotAllowed implements Step {
  constructor(private readonly router: KeepRouter) {}

  answer({ ctx }: Visit): Response | null {
    const allowed = new Set(this.router.allowed(ctx.url.pathname))
    if (allowed.size === 0) return null
    if (allowed.has('GET')) allowed.add('HEAD')
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { allow: [...allowed].join(', ') },
    })
  }
}

class NotFound implements Step {
  constructor(private readonly router: KeepRouter) {}

  answer({ ctx }: Visit): Response | Promise<Response> {
    return this.router.notFoundHandler(ctx)
  }
}
