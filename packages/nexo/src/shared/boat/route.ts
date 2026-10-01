import { fillPattern, parsePattern, type Pattern } from './pattern'
import type { LinkParams, PathParams } from './types'

/** One path, or one path per language. */
export type RoutePaths = string | Readonly<Record<string, string>>

/** The params a route's paths capture, typed from the path text. */
export type ParamsOf<Paths extends RoutePaths> = Paths extends string
  ? PathParams<Paths>
  : PathParams<Paths[keyof Paths] & string>

/** The languages a route is declared in (`never` for a single path). */
export type LanguagesOf<Paths extends RoutePaths> = Paths extends string
  ? never
  : keyof Paths & string

/** `href` asks for params only when the path has some, and for a language only when there are several. */
type HrefArgs<P, L extends string> = [L] extends [never]
  ? {} extends P
    ? [params?: P]
    : [params: P]
  : {} extends P
    ? [params: P | undefined, lang: L]
    : [params: P, lang: L]

/**
 * A route declared on its own, so links to it are checked by the editor and
 * any file can build them without the router:
 *
 *   export const consoleRoute = route('console', {
 *     es: '/es/consola/:id',
 *     en: '/en/console/:id',
 *   })
 *
 *   consoleRoute.href({ id: 'nes' }, 'es')   // '/es/consola/nes'
 *   router.get(consoleRoute, handler)        // registered like any route
 *
 * It's a plain object: `href` only fills in the paths written here.
 */
export interface RouteDef<N extends string, Paths extends RoutePaths> {
  readonly name: N
  readonly paths: Paths
  /** Types only: the params `href` expects. */
  readonly params: ParamsOf<Paths>
  href(...args: HrefArgs<ParamsOf<Paths>, LanguagesOf<Paths>>): string
}

export function route<const N extends string, const Paths extends RoutePaths>(
  name: N,
  paths: Paths,
): RouteDef<N, Paths> {
  const patterns = parsePaths(name, paths)
  return {
    name,
    paths,
    params: undefined as never,
    href: (params?: LinkParams, lang?: string) =>
      fillPattern(pick(name, patterns, lang), params),
  }
}

/** Parsed paths keyed by language; a single path is keyed by `undefined`. */
export type Patterns = Map<string | undefined, Pattern>

export function parsePaths(name: string, paths: RoutePaths): Patterns {
  if (typeof paths === 'string')
    return new Map([[undefined, parsePattern(paths)]])
  const entries = Object.entries(paths)
  if (entries.length === 0) {
    throw new Error(`boat: route "${name}" has no paths`)
  }
  return new Map(entries.map(([lang, path]) => [lang, parsePattern(path)]))
}

/** The pattern to fill for a language, with a clear error when it can't be chosen. */
export function pick(
  name: string,
  patterns: Patterns,
  lang: string | undefined,
): Pattern {
  const single = patterns.get(undefined)
  if (single) return single
  const languages = [...patterns.keys()].join(', ')
  if (lang === undefined) {
    throw new Error(
      `boat: route "${name}" is declared per language (${languages}); say which one to link to`,
    )
  }
  const pattern = patterns.get(lang)
  if (!pattern) {
    throw new Error(
      `boat: route "${name}" has no "${lang}" version (it has: ${languages})`,
    )
  }
  return pattern
}
