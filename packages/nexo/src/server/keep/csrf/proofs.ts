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
 * this site's host or a trusted origin is here; another, or `null` (a
 * sandboxed page, a redirect), is outside. The host, not the whole
 * origin: behind a TLS proxy the browser says `https://site` while keep
 * sees `http://site`, the same site.
 */
export class OriginHeader implements Proof {
  constructor(private readonly trusted: ReadonlySet<string>) {}

  judge(request: Request): Verdict | null {
    const origin = request.headers.get('origin')
    if (origin === null) return null
    if (this.trusted.has(origin)) return 'here'
    return hostOf(origin) === new URL(request.url).host ? 'here' : 'outside'
  }
}

/** `https://site:8443` → `site:8443`; `null`, or anything not a URL, has none. */
function hostOf(origin: string): string | undefined {
  try {
    return new URL(origin).host
  } catch {
    return undefined
  }
}

/**
 * A token this site issued (see `ctx.csrf.token`), brought back in the
 * `x-csrf-token` header or the `_csrf` form field: the one in the cookie is here,
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
