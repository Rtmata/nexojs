import type { Languages } from './language'
import type { NameBook } from './name-book'
import { Pattern } from './pattern'
import { quoted } from './quoted'
import { Variants } from './route'
import type { RedirectTarget } from './router'
import type { Context } from './types'

/** Where a declared redirect sends a request, worked out per request. */
export type Resolve = (ctx: Context) => string

/**
 * A redirect's source: its name or path, and its paths per language. It
 * checks a target language by language: each path of the source must be
 * able to fill the target's path in the same language, and never land on
 * itself.
 */
export class RedirectSource {
  readonly languages: string[]

  constructor(
    readonly label: string,
    private readonly variants: Variants,
  ) {
    this.languages = variants.languages
  }

  /** Throws when the target's name is the source's own: every visit would loop. */
  ensureNotNamed(to: string): void {
    if (to === this.label) throw this.loop(to)
  }

  /** Throws when the target can't be filled from each source path, or would loop. */
  ensureReaches(to: string, target: Variants): void {
    this.ensureLanguages(to, target)
    for (const [source, pattern] of this.pairs(target)) {
      if (pattern.shape === source.shape) throw this.loop(to)
      this.ensureParams(to, source, pattern)
    }
  }

  private ensureLanguages(to: string, target: Variants): void {
    if (target.single) return
    const lacking = this.languages.filter((l) => !target.has(l))
    if (lacking.length === 0) return
    throw new Error(
      `boat: redirect from "${this.label}" to "${to}": "${to}" has no ${quoted(lacking)} version. Give it one, or limit the redirect with { only }`,
    )
  }

  /**
   * Each source path with the target path it can lead to: the same
   * language's, or every one when the source has a single path (the
   * request's language picks).
   */
  private pairs(target: Variants): [Pattern, Pattern][] {
    return this.variants.entries().flatMap(([lang, source]) => {
      if (target.single) return [[source, target.in(undefined)]]
      if (lang !== undefined) return [[source, target.in(lang)]]
      return target.entries().map(([, p]): [Pattern, Pattern] => [source, p])
    })
  }

  private ensureParams(to: string, source: Pattern, target: Pattern): void {
    const missing = target.params.filter(
      (n) => n !== '*' && !source.params.includes(n),
    )
    if (missing.length === 0) return
    throw new Error(
      `boat: redirect from "${source.path}" to "${to}" needs ${quoted(missing.map((n) => `:${n}`))}, which "${source.path}" doesn't capture. Capture it in the source path, or redirect with a function`,
    )
  }

  private loop(to: string): Error {
    return new Error(
      `boat: redirect from "${this.label}" to "${to}" would send visitors back to the same URL forever. Point it at another route`,
    )
  }
}

/**
 * Declared redirects: turns each target into a resolver, and keeps every
 * one that goes to a route name, so a name registered later is checked when
 * it arrives and `check()` can make sure each has a GET route.
 */
export class Redirects {
  /** Every redirect to a route name, to check at startup that it has a GET route. */
  private readonly targets: { from: RedirectSource; to: string }[] = []

  constructor(
    private readonly names: NameBook,
    private readonly languages: Languages<string>,
  ) {}

  /**
   * How a target finds its location for a request:
   *   https://… or //…    as is
   *   /path/:id?q#h       params filled from the request (query and hash kept)
   *   name or route()     that route, same params, in the request's language
   *                       (else the default one, else any it has)
   *   (ctx) => url        whatever it returns
   * Throws now when the target can't be reached from the source. Stores nothing.
   */
  resolverFor(to: RedirectTarget, from: RedirectSource): Resolve {
    if (typeof to === 'function') return to
    if (typeof to !== 'string')
      return this.toRoute(to.name, Variants.of(to), from)
    if (isAbsolute(to)) return () => to
    if (to.startsWith('/')) return this.toPath(to, from)
    return this.toRoute(to, undefined, from)
  }

  /** Remember a redirect to a route name, so `check()` can find its GET route. */
  track(from: RedirectSource, name: string): void {
    this.targets.push({ from, to: name })
  }

  /** The route name a target points at, if it's a name or a `route()`. */
  nameOf(to: RedirectTarget): string | undefined {
    if (typeof to === 'function') return undefined
    if (typeof to !== 'string') return to.name
    return isAbsolute(to) || to.startsWith('/') ? undefined : to
  }

  /** A name just arrived: every redirect waiting for it must be able to reach it. */
  ensureArrival(name: string, variants: Variants): void {
    for (const { from } of this.targets.filter((t) => t.to === name)) {
      from.ensureReaches(name, variants)
    }
  }

  /**
   * Throws when a redirect goes to a name nobody registered, or one with no
   * GET route: a browser follows a redirect with GET.
   */
  check(): void {
    const missing = this.targets.filter((w) => !this.names.answers(w.to, 'GET'))
    if (missing.length === 0) return
    const list = missing.map(
      (w) => `redirect from "${w.from.label}" goes to "${w.to}"`,
    )
    throw new Error(
      `boat: ${list.join(', ')}, but no GET route has that name. Register one with router.get`,
    )
  }

  private toPath(to: string, from: RedirectSource): Resolve {
    const end = to.search(/[?#]/)
    const pattern = new Pattern(end === -1 ? to : to.slice(0, end))
    const suffix = end === -1 ? '' : to.slice(end)
    from.ensureReaches(to, new Variants(to, pattern.path))
    // Filled even without params: fill() encodes ('/漢字' is no valid Location).
    if (pattern.params.length === 0) {
      const location = pattern.fill() + suffix
      return () => location
    }
    return (ctx) => pattern.fill(pattern.pick(ctx.params)) + suffix
  }

  /** `fixed` is a route()'s own paths; a name is looked up per request. */
  private toRoute(
    name: string,
    fixed: Variants | undefined,
    from: RedirectSource,
  ): Resolve {
    from.ensureNotNamed(name)
    const known = fixed ?? this.names.get(name)
    if (known) from.ensureReaches(name, known)
    return (ctx) => this.locate(name, fixed, ctx)
  }

  private locate(
    name: string,
    fixed: Variants | undefined,
    ctx: Context,
  ): string {
    const variants = fixed ?? this.names.require(name)
    const pattern = variants.in(
      variants.firstOf([ctx.lang, this.languages.default]),
    )
    return pattern.fill(pattern.pick(ctx.params))
  }
}

/**
 * A location to use as is: `scheme://…`, `//host/…`, or one of the
 * schemes without slashes (`mailto:`, `tel:`…). Anything else with a colon
 * is a route name.
 */
function isAbsolute(to: string): boolean {
  return (
    /^([a-z][a-z0-9+.-]*:\/\/|\/\/)/i.test(to) ||
    /^(mailto|tel|sms|geo|data|urn):/i.test(to)
  )
}
