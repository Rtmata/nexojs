import type { Context, Handler } from '../../../shared/http/types'
import type { Middleware } from '../middleware'
import { mint, TokenCookie } from './cookie'
import {
  FetchSite,
  IssuedToken,
  OriginHeader,
  type Proof,
  type Verdict,
} from './proofs'
import { SAFE_METHODS } from './vocabulary'

export interface HedgeOptions {
  /** Origins whose requests count as this site's: `['https://admin.museo.mx']`. */
  trusted?: readonly string[]
  /** Paths that are never judged: a path as written, or a prefix ending in `/` (`'/api/'`). */
  except?: readonly string[]
  /** A request nobody can vouch for is refused; by default it passes (curl, tests, servers). */
  strict?: boolean
}

/**
 * Is this request from here? Asked once of every request that changes
 * something (not GET, HEAD, OPTIONS), and answered by the first proof that
 * can speak: the browser's `Sec-Fetch-Site`, then its `Origin`, then a
 * token this site issued. One verdict: a request from outside gets a 403
 * before any handler runs. Every request, safe or not, gets a token in
 * `ctx.hedge.token` for its forms; a browser without one is given it in a
 * cookie with the response. keep turns this on by itself:
 *
 *   keep({ router })                                      // on
 *   keep({ router, hedge: false })                        // off
 *   keep({ router, hedge: { except: ['/api/'], strict: true } })
 */
export function hedge(options: HedgeOptions = {}): Middleware {
  const judge = new Judge(options)
  return (handler) => (ctx) => judge.guard(ctx, handler)
}

/** The three proofs and the exemptions, applied to one request at a time. */
class Judge {
  private readonly proofs: readonly Proof[]
  private readonly except: readonly string[]
  private readonly whenSilent: Verdict

  constructor(options: HedgeOptions) {
    const trusted = new Set((options.trusted ?? []).map(originOf))
    this.proofs = [
      new FetchSite(trusted),
      new OriginHeader(trusted),
      new IssuedToken(),
    ]
    this.except = options.except ?? []
    this.whenSilent = options.strict ? 'outside' : 'here'
  }

  async guard(ctx: Context, handler: Handler): Promise<Response> {
    const issued = Issued.for(ctx.request)
    if (await this.refuses(ctx, issued.token)) return refused()
    const response = await handler({ ...ctx, hedge: { token: issued.token } })
    return issued.stamp(response)
  }

  private async refuses(ctx: Context, token: string): Promise<boolean> {
    if (SAFE_METHODS.has(ctx.request.method)) return false
    if (this.exempt(ctx.url.pathname)) return false
    return (await this.verdict(ctx.request, token)) === 'outside'
  }

  private exempt(pathname: string): boolean {
    return this.except.some((path) =>
      path.endsWith('/') ? pathname.startsWith(path) : pathname === path,
    )
  }

  /** The first proof with something to say decides; silence falls to the `strict` knob. */
  private async verdict(request: Request, token: string): Promise<Verdict> {
    for (const proof of this.proofs) {
      const verdict = await proof.judge(request, token)
      if (verdict) return verdict
    }
    return this.whenSilent
  }
}

/** The token of one request: the cookie's, or a fresh one the response hands out. */
class Issued {
  private constructor(
    readonly token: string,
    private readonly cookie: TokenCookie,
    private readonly fresh: boolean,
  ) {}

  static for(request: Request): Issued {
    const cookie = TokenCookie.for(new URL(request.url))
    const brought = cookie.read(request)
    return new Issued(brought ?? mint(), cookie, brought === null)
  }

  /** The response with the cookie, when the request had none; copied, since a redirect's headers can't be touched. */
  stamp(response: Response): Response {
    if (!this.fresh) return response
    const stamped = new Response(response.body, response)
    stamped.headers.append('set-cookie', this.cookie.write(this.token))
    return stamped
  }
}

function refused(): Response {
  return new Response('hedge: this request did not come from this site', {
    status: 403,
  })
}

/** A trusted origin as the browser would send it; anything else is a setup mistake, reported at once. */
function originOf(given: string): string {
  try {
    return new URL(given).origin
  } catch {
    throw new Error(`hedge: trusted origin "${given}" is not a URL`)
  }
}
