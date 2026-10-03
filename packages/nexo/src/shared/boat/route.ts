import { findTag } from '../lang/tag'
import { Pattern } from './pattern'
import { quoted } from './quoted'
import type { LinkParams, RouteDef, RoutePaths } from '../http/types'

export type {
  LanguagesOf,
  ParamsIn,
  ParamsOf,
  RouteDef,
  RoutePaths,
} from '../http/types'

/**
 * Declare a route on its own, so links to it are checked by the editor
 * and any file can build them without the router:
 *
 *   export const consoleRoute = route('console', {
 *     es: '/es/consola/:id',
 *     en: '/en/console/:id',
 *   })
 *   consoleRoute.href({ id: 'nes' }, 'es')   // '/es/consola/nes'
 */

export function route<const N extends string, const Paths extends RoutePaths>(
  name: N,
  paths: Paths,
): RouteDef<N, Paths> {
  const variants = new Variants(name, paths)
  const def = {
    name,
    paths,
    params: undefined as never,
    href: ((params?: LinkParams, lang?: string) =>
      variants.in(lang).fill(params)) as RouteDef<N, Paths>['href'],
  }
  parsedDefs.set(def, variants) // parsed once, for links and the router
  return def
}

/** An object of paths per language (not a `route()` definition). */
export function isPathsObject(value: unknown): value is Record<string, string> {
  return typeof value === 'object' && value !== null && !isRouteDef(value)
}

export function isRouteDef(
  value: unknown,
): value is RouteDef<string, RoutePaths> {
  if (typeof value !== 'object' || value === null) return false
  return 'name' in value && 'paths' in value && 'href' in value
}

/**
 * The paths of one route: a single one, or one per language. Keyed by
 * language; a single path is keyed by `undefined`.
 */
export class Variants {
  private readonly byLang: ReadonlyMap<string | undefined, Pattern>

  constructor(
    readonly name: string,
    paths: RoutePaths,
  ) {
    this.byLang = parsePaths(name, paths)
  }

  /** The variants of a `route()` definition, parsed once per definition. */
  static of(def: RouteDef<string, any>): Variants {
    let variants = parsedDefs.get(def)
    if (!variants)
      parsedDefs.set(def, (variants = new Variants(def.name, def.paths)))
    return variants
  }

  /** True for a route without languages (one path for everyone). */
  get single(): boolean {
    return this.byLang.has(undefined)
  }

  /** The languages it has, in declaration order. */
  get languages(): string[] {
    return [...this.byLang.keys()].filter((l): l is string => l !== undefined)
  }

  /** Every `[language, pattern]` pair (`undefined` language for a single path). */
  entries(): [string | undefined, Pattern][] {
    return [...this.byLang]
  }

  /** Whether it has this language, however its tag is spelled. */
  has(lang: string | undefined): boolean {
    return this.keyOf(lang) !== null
  }

  /** The language as written in its paths ('es-MX' for 'es_mx'), or `null`. */
  private keyOf(lang: string | undefined): string | undefined | null {
    if (lang === undefined) return this.single ? undefined : null
    return findTag(this.languages, lang) ?? null
  }

  /** The pattern to use for a language, with a clear error when there's none. */
  in(lang: string | undefined): Pattern {
    if (this.single) return this.byLang.get(undefined)!
    const key = this.keyOf(lang)
    return key === null ? this.missing(lang) : this.byLang.get(key)!
  }

  private missing(lang: string | undefined): never {
    const list = quoted(this.languages)
    if (lang === undefined) {
      throw new Error(
        `boat: route "${this.name}" is declared per language (${list}); say which one to link to`,
      )
    }
    throw new Error(
      `boat: route "${this.name}" has no "${lang}" version (it has: ${list}). Link in one of those, or give the route a "${lang}" path`,
    )
  }

  /** The first of these languages it has (single routes take any). */
  firstOf(preferred: readonly (string | undefined)[]): string | undefined {
    if (this.single) return undefined
    return [...preferred, ...this.languages].find(
      (l) => l !== undefined && this.has(l),
    )
  }

  /** True when both have exactly the same paths for the same languages. */
  sameAs(other: Variants): boolean {
    const mine = this.entries()
    if (mine.length !== other.entries().length) return false
    return mine.every(
      ([lang, p]) => other.has(lang) && other.in(lang).path === p.path,
    )
  }
}

const parsedDefs = new WeakMap<object, Variants>()

function parsePaths(
  name: string,
  paths: RoutePaths,
): Map<string | undefined, Pattern> {
  if (typeof paths === 'string')
    return new Map([[undefined, new Pattern(paths)]])
  const entries = Object.entries(paths)
  if (entries.length === 0)
    throw new Error(
      `boat: route "${name}" has no paths. Give it one per language: { en: '/…', es: '/…' }`,
    )
  return new Map(entries.map(([lang, path]) => [lang, new Pattern(path)]))
}
