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
 * scheme: references followed, light or dark picked, from the
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
  const fixed = set.fixedScheme()
  if (fixed && fixed !== colorScheme)
    throw new Error(
      `glyph: resolve: this theme is always ${fixed}; ask for colorScheme: '${fixed}'`,
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
   * don't reach; it fixes the scheme the values were picked for. Another
   * `selector` puts them elsewhere: `:host` in a shadow root, `.preview`.
   *
   *   shadow.innerHTML = `<style>${night.css({ selector: ':host' })}</style>…`
   */
  css({ selector = ':root' }: { readonly selector?: string } = {}): string {
    checkSelector(selector)
    const entries: [string, string][] = Object.entries(this.values)
    const lines = entries.map(([name, value]) => `--${name}: ${value};`)
    return `${rule(selector, [`color-scheme: ${this.colorScheme};`, ...lines])}\n`
  }
}

/** Characters that would end the rule or the `<style>` around it: a selector never needs them. */
const OUTSIDE_SELECTOR = /[{};<\n\r]|^\s*$/

function checkSelector(selector: string): void {
  if (!OUTSIDE_SELECTOR.test(selector)) return
  throw new Error(
    `glyph: resolve: ${JSON.stringify(selector)} can't be a selector here; write one such as ":host" or ".preview", without { } ; < or line breaks`,
  )
}
