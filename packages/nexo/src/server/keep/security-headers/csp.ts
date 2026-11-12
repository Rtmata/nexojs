/** A Content Security Policy as it is written: directive names as in the header, sources as in the header, `'nonce'` for this request's nonce. */
export type Directives = Readonly<Record<string, readonly string[]>>

/** The word a source list uses for the nonce keep mints per request: `'script-src': ["'self'", 'nonce']` → `'nonce-…'`. */
export const NONCE = 'nonce'

/**
 * The policy, checked once when the server is set up (an unknown
 * directive is a typo the browser would silently ignore) and written per
 * request with that request's nonce in place of the word `'nonce'`.
 */
export class Policy {
  readonly header: string

  constructor(
    private readonly directives: Directives,
    reportOnly: boolean,
  ) {
    for (const name of Object.keys(directives)) ensureDirective(name)
    this.header = reportOnly
      ? 'content-security-policy-report-only'
      : 'content-security-policy'
  }

  /** `default-src 'self'; script-src 'self' 'nonce-…'`; a directive without sources stands alone. */
  value(nonce: string): string {
    return Object.entries(this.directives)
      .map(([name, sources]) =>
        [name, ...sources.map((s) => sourceOf(s, nonce))].join(' '),
      )
      .join('; ')
  }
}

function sourceOf(source: string, nonce: string): string {
  return source === NONCE ? `'nonce-${nonce}'` : source
}

function ensureDirective(name: string): void {
  if (DIRECTIVES.has(name)) return
  throw new Error(
    `securityHeaders: "${name}" is not a Content-Security-Policy directive (write it as in the header: 'script-src')`,
  )
}

/** The directives browsers know (CSP Level 3 and what is still honoured). */
const DIRECTIVES = new Set([
  'default-src',
  'script-src',
  'script-src-elem',
  'script-src-attr',
  'style-src',
  'style-src-elem',
  'style-src-attr',
  'img-src',
  'font-src',
  'connect-src',
  'media-src',
  'object-src',
  'child-src',
  'frame-src',
  'worker-src',
  'manifest-src',
  'prefetch-src',
  'base-uri',
  'form-action',
  'frame-ancestors',
  'sandbox',
  'report-to',
  'report-uri',
  'upgrade-insecure-requests',
  'require-trusted-types-for',
  'trusted-types',
])
