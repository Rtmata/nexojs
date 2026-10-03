import type { Languages } from './language'
import type { NameBook } from './name-book'
import { Variants, type RouteDef } from './route'
import type { Match } from './route-table'
import type { Link, LinkParams } from './types'

type Target = string | RouteDef<string, any>

/**
 * Builds URLs to routes: by name or `route()`, in a language. Only queries:
 * nothing here changes the router.
 */
export class Links<L extends string> {
  /** `ctx.link` for each language (and none), built once: links are asked for on every request. */
  private readonly boundLinks: Map<string | undefined, Link<L>>

  constructor(
    private readonly names: NameBook,
    private readonly languages: Languages<L>,
  ) {
    const all = [undefined, ...languages.list]
    this.boundLinks = new Map(all.map((lang) => [lang, this.linkIn(lang)]))
  }

  /**
   * The URL of a route in a language. Throws if the name, a param or the
   * language doesn't exist.
   */
  href(target: Target, params?: LinkParams, lang?: string): string {
    const known = lang === undefined ? undefined : this.languages.known(lang)
    return this.variantsOf(target).in(known).fill(params)
  }

  /**
   * `ctx.link`: a language asked for explicitly must exist. Otherwise the
   * request's, else the default one, else any the target has — a link to
   * an English-only page doesn't break a Spanish one.
   */
  bound(current: string | undefined): Link<L> {
    return this.boundLinks.get(current) ?? this.linkIn(current)
  }

  private linkIn(current: string | undefined): Link<L> {
    return ((target: Target, params?: LinkParams, lang?: string) => {
      if (lang !== undefined) return this.href(target, params, lang)
      const variants = this.variantsOf(target)
      const chosen = variants.firstOf([current, this.languages.default])
      return variants.in(chosen).fill(params)
    }) as Link<L>
  }

  /**
   * The current page in every language it exists in, for a language switcher
   * or `hreflang` links. Empty for routes without languages.
   */
  alternates(found: Match | null, url: URL): Partial<Record<L, string>> {
    const variants = found?.route.name
      ? this.names.get(found.route.name)
      : undefined
    if (!found || !variants || variants.single) return {}
    return this.placed(this.pathsIn(variants, found), url)
  }

  private variantsOf(target: Target): Variants {
    if (typeof target !== 'string') return Variants.of(target)
    return this.names.require(target)
  }

  /**
   * Each language's path, filled with the params it names; a language whose
   * path needs one this URL didn't capture is left out.
   */
  private pathsIn(
    variants: Variants,
    found: Match,
  ): Partial<Record<L, string>> {
    const paths: Partial<Record<L, string>> = {}
    for (const [lang, pattern] of variants.entries()) {
      const needed = pattern.params.filter((n) => n !== '*')
      if (needed.every((n) => found.params[n] !== undefined)) {
        paths[lang as L] = pattern.fill(pattern.pick(found.params))
      }
    }
    return paths
  }

  /**
   * A path of its own is the link. A path several languages share needs a
   * langFrom that lives in the URL (subdomain, query) to point at each one;
   * cookies and headers can't, so those languages are left out.
   */
  private placed(
    paths: Partial<Record<L, string>>,
    url: URL,
  ): Partial<Record<L, string>> {
    const placed: Partial<Record<L, string>> = {}
    for (const [lang, path] of Object.entries(paths) as [L, string][]) {
      const shared = sharers(paths, path) > 1
      const located = shared ? this.languages.place(url, lang, path) : path
      if (located) placed[lang] = located
    }
    return placed
  }
}

/** How many languages use this path. */
function sharers(paths: Partial<Record<string, string>>, path: string): number {
  return Object.values(paths).filter((p) => p === path).length
}
