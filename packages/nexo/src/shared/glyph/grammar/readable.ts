import { readColor } from '../color/read'
import { Resolver } from '../resolver'
import type { ThemeError } from '../theme-error'
import type { TokenSet } from '../token-set'

/**
 * Each colour a person set, followed to its final value in both schemes,
 * must be one glyph reads, so every contrast pair can be measured: a
 * reference may lead to a token written in code as `color-mix()` or
 * `currentColor`, which the browser reads and glyph can't. Run once the
 * loops are out, so following never goes round.
 */
export function unreadableColors(
  set: TokenSet,
  changes: Readonly<Record<string, Readonly<Record<string, unknown>>>>,
): ThemeError[] {
  return Object.entries(changes).flatMap(([group, tokens]) =>
    Object.entries(tokens).flatMap(([token, value]) => {
      const property = `${group}-${token}`
      if (set.find(property)?.type !== 'color') return []
      const why = whyUnreadable(set, property)
      return why === undefined
        ? []
        : [unreadable(`${group}.${token}`, value, why)]
    }),
  )
}

function whyUnreadable(set: TokenSet, property: string): string | undefined {
  for (const scheme of ['light', 'dark'] as const) {
    try {
      readColor(new Resolver(set, scheme).value(property))
    } catch (error) {
      return (error as Error).message.replace(/^glyph: /, '')
    }
  }
  return undefined
}

function unreadable(path: string, value: unknown, why: string): ThemeError {
  const message = `${path}: ${JSON.stringify(value)} leads to a colour glyph can't measure: ${why}`
  return { path, code: 'notAColor', data: { value }, message }
}
