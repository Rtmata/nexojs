import type { Context } from '../../shared/http/types'
import type { KeepRouter } from './keep'

/**
 * `keep({ router: fn })`: a router with no routes whose 404 is the function,
 * so the usual order (routes, then static files, then 404) serves files
 * first and the function answers everything else.
 */
export class FunctionRouter implements KeepRouter {
  constructor(
    private readonly answer: (request: Request) => Response | Promise<Response>,
  ) {}

  match(): null {
    return null
  }

  allowed(): string[] {
    return []
  }

  notFoundHandler = (ctx: Context) => this.answer(ctx.request)

  errorHandler = () => new Response('Internal Server Error', { status: 500 })
}
