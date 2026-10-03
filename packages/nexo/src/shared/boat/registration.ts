import type { Languages } from './language'
import { findTag } from '../lang/tag'
import { quoted } from './quoted'
import {
  isPathsObject,
  isRouteDef,
  Variants,
  type RouteDef,
  type RoutePaths,
} from './route'
import type { RouteOptions } from './router'
import type { Params, RouteHandler } from './types'

/**
 * One call to `router.get(...)` (or `post`, `put`…), read into its parts.
 * The four ways to call it are told apart by their first argument:
 *
 *   ('/path', handler)                  a plain path
 *   (route(), handler, options?)        a route() definition
 *   ('name', '/path', handler)          a named path
 *   ('name', { en, es }, handler, options?)   a name and paths per language
 */
export class Registration {
  constructor(
    readonly name: string | undefined,
    readonly paths: RoutePaths,
    readonly handler: RouteHandler<Params, any>,
    readonly only: readonly string[] | undefined,
    /** The `route()` it came from, whose paths are already parsed. */
    private readonly def?: RouteDef<string, any>,
  ) {
    ensurePaths(this.label, paths)
    ensureHandler(this.label, handler)
  }

  static read(args: readonly unknown[]): Registration {
    return new Registration(...partsOf(args))
  }

  /** Its name, or its path. */
  get label(): string {
    return this.name ?? String(this.paths)
  }

  /** Its paths, parsed (once per `route()` definition). */
  variants(): Variants {
    if (this.def) return Variants.of(this.def)
    return new Variants(this.label, this.paths)
  }

  /**
   * Throws unless its languages are exactly the declared ones (or the
   * `only` subset). Routes with one path have no languages to check.
   */
  ensureLanguages(variants: Variants, languages: Languages<string>): void {
    if (typeof this.paths === 'string') return this.ensureNoOnly()
    const name = this.name!
    if (languages.list.length === 0) {
      throw new Error(
        `boat: route "${name}" has a path per language, but no languages were declared. Use boat({ languages: [...] })`,
      )
    }
    this.ensureDeclared(variants, languages.list)
    this.ensureComplete(variants, this.only ?? languages.list)
  }

  private ensureNoOnly(): void {
    if (!this.only) return
    throw new Error(
      `boat: { only } is for routes declared per language, not for "${this.name ?? this.paths}". Remove { only }, or give the route a path per language`,
    )
  }

  private ensureDeclared(
    variants: Variants,
    declared: readonly string[],
  ): void {
    for (const lang of [...variants.languages, ...(this.only ?? [])]) {
      if (findTag(declared, lang) === undefined) {
        throw new Error(
          `boat: route "${this.name}" uses language "${lang}", which is not one of the languages (${quoted(declared)}). Add it to boat({ languages }) or drop that path`,
        )
      }
    }
  }

  private ensureComplete(
    variants: Variants,
    expected: readonly string[],
  ): void {
    const missing = expected.filter((lang) => !variants.has(lang))
    if (missing.length === 0) return this.ensureNoExtra(variants, expected)
    throw new Error(
      `boat: route "${this.name}" has no path for ${quoted(missing)}. Add it, or mark the route { only: [...] }`,
    )
  }

  private ensureNoExtra(variants: Variants, expected: readonly string[]): void {
    const extra = variants.languages.filter(
      (lang) => findTag(expected, lang) === undefined,
    )
    if (extra.length === 0) return
    throw new Error(
      `boat: route "${this.name}" has a path for ${quoted(extra)}, which { only } leaves out. Add it to { only } or remove that path`,
    )
  }
}

type Handler = RouteHandler<Params, any>
type Parts = [
  string | undefined,
  RoutePaths,
  Handler,
  readonly string[] | undefined,
  RouteDef<string, any>?,
]

function partsOf(args: readonly unknown[]): Parts {
  const [first, second, third, fourth] = args as [unknown, any, any, unknown]
  if (typeof first === 'string' && first.startsWith('/')) {
    return [undefined, first, second, onlyOf(third)]
  }
  if (isRouteDef(first))
    return [first.name, first.paths, second, onlyOf(third), first]
  if (typeof first === 'string') return [first, second, third, onlyOf(fourth)]
  throw new Error('boat: a route needs a path, a name, or a route() definition')
}

function onlyOf(options: unknown): readonly string[] | undefined {
  return (options as RouteOptions<string> | undefined)?.only
}

/** One path, or an object of paths per language: fail at registration, not per request. */
function ensurePaths(label: string, paths: unknown): void {
  if (typeof paths === 'string' || isPathsObject(paths)) return
  throw new Error(
    `boat: route "${label}" needs a path starting with "/" or its paths per language, before the handler`,
  )
}

/** A function, or `{ load, page }`: fail at registration, not per request. */
function ensureHandler(label: string, handler: unknown): void {
  if (typeof handler === 'function') return
  const steps = handler as { load?: unknown; page?: unknown } | null
  if (typeof steps?.load === 'function' && typeof steps.page === 'function')
    return
  throw new Error(
    `boat: route "${label}" needs a handler: a function, or { load, page }`,
  )
}
