import { FIELD, HEADER } from './vocabulary'

/** Where a request comes from, as far as a proof can tell. */
export type Verdict = 'here' | 'outside'

/**
 * One way to tell where a request comes from (pattern: strategy). A proof
 * that has nothing to go on says `null`, and the next one is asked.
 */
export interface Proof {
  judge(
    request: Request,
    token: string,
  ): Verdict | null | Promise<Verdict | null>
}

/**
 * The browser's own word, `Sec-Fetch-Site`, which no page can forge: the
 * request was made from this origin (or typed, a bookmark), or from
 * another site — which is fine when that site's `Origin` is trusted.
 */
export class FetchSite implements Proof {
  constructor(private readonly trusted: ReadonlySet<string>) {}

  judge(request: Request): Verdict | null {
    const site = request.headers.get('sec-fetch-site')
    if (site === null) return null
    if (site === 'same-origin' || site === 'none') return 'here'
    return this.trusted.has(request.headers.get('origin') ?? '')
      ? 'here'
      : 'outside'
  }
}

/**
 * The `Origin` header, for browsers that send it without Fetch Metadata:
 * this site's own origin or a trusted one is here; another, or `null`
 * (a sandboxed page, a redirect), is outside.
 */
export class OriginHeader implements Proof {
  constructor(private readonly trusted: ReadonlySet<string>) {}

  judge(request: Request): Verdict | null {
    const origin = request.headers.get('origin')
    if (origin === null) return null
    const own = new URL(request.url).origin
    return origin === own || this.trusted.has(origin) ? 'here' : 'outside'
  }
}

/**
 * A token this site issued (see `ctx.hedge.token`), brought back in the
 * `hedge` header or the `_hedge` form field: the one in the cookie is here,
 * any other is outside. The body is read only when a form could carry it,
 * and only on a copy, so the handler still gets it whole.
 */
export class IssuedToken implements Proof {
  async judge(request: Request, token: string): Promise<Verdict | null> {
    const brought = request.headers.get(HEADER) ?? (await fieldOf(request))
    if (brought === null) return null
    return brought === token ? 'here' : 'outside'
  }
}

const FORM_TYPES = ['application/x-www-form-urlencoded', 'multipart/form-data']

async function fieldOf(request: Request): Promise<string | null> {
  const type = request.headers.get('content-type')?.split(';')[0]?.trim()
  if (!type || !FORM_TYPES.includes(type)) return null
  const fields = await request.clone().formData()
  const value = fields.get(FIELD)
  return typeof value === 'string' ? value : null
}
