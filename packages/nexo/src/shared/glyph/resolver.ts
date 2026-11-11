import { cssValue, isLightDark } from './token-group'
import type { ColorScheme, Found, TokenSet } from './token-set'

/** A reference to another token anywhere in a value: `var(--blue-500)`. */
const REFERENCE = /var\(--([A-Za-z0-9_-]+)\)/g

/**
 * Final values from the definitions (C.6), as the browser would compute
 * them for one scheme: each `var(--…)` replaced by the value it points to,
 * each `{ light, dark }` by its side. Nothing is read from a page.
 */
export class Resolver {
  constructor(
    private readonly set: TokenSet,
    private readonly scheme: ColorScheme,
  ) {}

  /** The final value of `--<property>`; `seen` is the chain that led here. */
  value(property: string, seen: readonly string[] = []): string {
    if (seen.includes(property))
      throw new Error(cycleMessage([...seen, property]))
    const found = this.set.find(property)
    if (!found) throw new Error(missingMessage(property, seen))
    return this.final(found, [...seen, property])
  }

  private final({ type, value }: Found, seen: readonly string[]): string {
    const picked = isLightDark(value) ? value[this.scheme] : value
    // Checked when the tokens or the theme were made: it is a value of the type
    const css = cssValue(type, picked)!
    return css.replace(REFERENCE, (_, name: string) => this.value(name, seen))
  }
}

function cycleMessage(chain: readonly string[]): string {
  const shown = chain.map((p) => `--${p}`).join(' → ')
  return `glyph: --${chain[0]} points back to itself (${shown}); one of them needs a value`
}

function missingMessage(property: string, seen: readonly string[]): string {
  const by = seen.length > 0 ? `--${seen.at(-1)} points to ` : ''
  return `glyph: ${by}--${property}, which these tokens don't define; if another token object does (a palette), name it: defineTokens({ … }, { refersTo: [palette] })`
}
