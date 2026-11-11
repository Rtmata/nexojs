import { Resolver } from './resolver'
import { rule } from './sheet'
import { DEFINITION, type ColorScheme, type Defined } from './token-set'
import type { NamesOf } from './tokens'

/** Each token's property name without `--`: `color-surface`. */
export type PropertyName<D> = {
  [G in keyof D & string]: `${G}-${keyof NamesOf<D[G]> & (string | number)}`
}[keyof D & string]

/**
 * The final value of every token of a theme or a token object, for one
 * scheme (C.6): references followed, light or dark picked, from the
 * definitions alone — no page is read, so it works on the server, in a
 * worker, in a test. For what glyph's sheets don't reach: a reader iframe,
 * a canvas, an email.
 *
 *   const night = resolve(theme, { colorScheme: 'dark' })
 *   night.values['color-surface'] // '#111'
 *   frame.srcdoc = `<style>${night.css()}</style>…`
 */
export function resolve<D>(
  source: Defined<D>,
  { colorScheme }: { readonly colorScheme: ColorScheme },
): ResolvedTokens<D> {
  const set = source[DEFINITION]
  if (set.colorScheme && set.colorScheme !== colorScheme)
    throw new Error(
      `glyph: resolve: this theme is always ${set.colorScheme}; ask for colorScheme: '${set.colorScheme}'`,
    )
  const resolver = new Resolver(set, colorScheme)
  const values = set.properties().map((p) => [p, resolver.value(p)])
  return new ResolvedTokens(
    Object.freeze(Object.fromEntries(values)),
    colorScheme,
  )
}

/** What `resolve` gives: the values, and the CSS that sets them elsewhere. */
export class ResolvedTokens<D> {
  constructor(
    readonly values: Readonly<Record<PropertyName<D>, string>>,
    readonly colorScheme: ColorScheme,
  ) {}

  /**
   * `:root { … }` with the final values, for a document glyph's sheets
   * don't reach; it fixes the scheme the values were picked for.
   */
  css(): string {
    const entries: [string, string][] = Object.entries(this.values)
    const lines = entries.map(([name, value]) => `--${name}: ${value};`)
    return `${rule(':root', [`color-scheme: ${this.colorScheme};`, ...lines])}\n`
  }
}
