import type { Middleware } from '../middleware'
import { mint } from '../random'
import { withHeaders } from '../response'
import { Policy, type Directives } from './csp'

/** Each knob names a header: its value replaces the default, `false` leaves the header out. */
export interface BunkerOptions {
  /** `X-Content-Type-Options`, `nosniff` by default: a file is what its type says, never guessed. */
  contentTypeOptions?: string | false
  /** `Referrer-Policy`, `strict-origin-when-cross-origin` by default (the browsers' own): other sites see the origin only. */
  referrerPolicy?: string | false
  /** `X-Frame-Options`, `SAMEORIGIN` by default: no other site frames these pages. */
  frameOptions?: string | false
  /** `Cross-Origin-Opener-Policy`, `same-origin` by default: a page opened from another site gets no handle on it. */
  openerPolicy?: string | false
  /** `Cross-Origin-Resource-Policy`, `same-origin` by default: other sites cannot embed these files (hotlinking); `cross-origin` lets them. */
  resourcePolicy?: string | false
  /** `X-Permitted-Cross-Domain-Policies`, `none` by default: no Flash/PDF cross-domain policy files. */
  crossDomainPolicies?: string | false
  /** `X-DNS-Prefetch-Control`, `off` by default: the browser resolves no domain ahead of a click. */
  dnsPrefetchControl?: string | false
  /** `X-XSS-Protection`, `0` by default: the old filter off, it caused leaks of its own. */
  xssProtection?: string | false
  /** `Strict-Transport-Security`, sent on HTTPS only; 180 days with subdomains by default. */
  strictTransportSecurity?: string | false
  /**
   * `Content-Security-Policy`, none by default; see `Directives`. The nonce
   * is `ctx.bunker.nonce`. With bridge, `script-src` needs
   * `'inline-speculation-rules'` for the prefetch rules it writes inline.
   */
  csp?: Directives
  /** Send the policy as `Content-Security-Policy-Report-Only`: reported, not enforced. */
  reportOnly?: boolean
}

/**
 * Headers that tell the browser what it may do with each response — pages
 * and files alike — and a nonce per request for the site's own inline
 * scripts under a Content Security Policy. On by default with a set that
 * breaks nothing; the policy is explicit. A header a handler set itself
 * is left as it is.
 *
 *   keep({ router })                                   // the full set
 *   keep({ router, bunker: false })                    // none
 *   keep({ router, bunker: { frameOptions: false, resourcePolicy: 'cross-origin' } })
 *   keep({ router, bunker: { csp: { 'script-src': ["'self'", 'nonce', "'inline-speculation-rules'"] } } })
 *   <script nonce={ctx.bunker.nonce}>…</script>
 */
export function bunker(options: BunkerOptions = {}): Middleware {
  const walls = new Walls(options)
  const policy =
    options.csp && new Policy(options.csp, options.reportOnly ?? false)
  return (handler) => async (ctx) => {
    const nonce = mint()
    const response = await handler({ ...ctx, bunker: { nonce } })
    const headers = walls.for(ctx.url)
    if (policy) headers.push([policy.header, policy.value(nonce)])
    return withHeaders(response, headers)
  }
}

/** The fixed headers, resolved once: the default, the knob's value, or nothing. */
class Walls {
  private readonly always: [string, string][]
  private readonly https: [string, string][]

  constructor(options: BunkerOptions) {
    const chosen = (knob: Knob) => options[knob] ?? DEFAULTS[knob]
    const entries = (knobs: Knob[]) =>
      knobs.flatMap((knob): [string, string][] => {
        const value = chosen(knob)
        return value === false ? [] : [[HEADERS[knob], value]]
      })
    this.always = entries(PLAIN)
    this.https = entries(['strictTransportSecurity'])
  }

  for(url: URL): [string, string][] {
    const https = url.protocol === 'https:' ? this.https : []
    return [...this.always, ...https]
  }
}

type Knob = Exclude<keyof BunkerOptions, 'csp' | 'reportOnly'>

const HEADERS: Record<Knob, string> = {
  contentTypeOptions: 'x-content-type-options',
  referrerPolicy: 'referrer-policy',
  frameOptions: 'x-frame-options',
  openerPolicy: 'cross-origin-opener-policy',
  resourcePolicy: 'cross-origin-resource-policy',
  crossDomainPolicies: 'x-permitted-cross-domain-policies',
  dnsPrefetchControl: 'x-dns-prefetch-control',
  xssProtection: 'x-xss-protection',
  strictTransportSecurity: 'strict-transport-security',
}

const DEFAULTS: Record<Knob, string> = {
  contentTypeOptions: 'nosniff',
  referrerPolicy: 'strict-origin-when-cross-origin',
  frameOptions: 'SAMEORIGIN',
  openerPolicy: 'same-origin',
  resourcePolicy: 'same-origin',
  crossDomainPolicies: 'none',
  dnsPrefetchControl: 'off',
  xssProtection: '0',
  strictTransportSecurity: 'max-age=15552000; includeSubDomains',
}

/** Every knob but HSTS, which only means something over HTTPS. */
const PLAIN = (Object.keys(HEADERS) as Knob[]).filter(
  (knob) => knob !== 'strictTransportSecurity',
)
