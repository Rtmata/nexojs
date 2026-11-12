import { ReferenceCycle } from '../resolver'
import { referencesIn } from '../reference'
import type { ThemeError } from '../theme-error'
import { cssValue, isLightDark } from '../token-group'
import type { ColorScheme, TokenSet } from '../token-set'

/**
 * The reference loops a person's changes make, one per loop, at the
 * first changed token that runs into it: `color.surface` → `color.primary`
 * → `color.surface`. Searched in both schemes, since `{ light, dark }` may
 * loop on one side only, over the names alone: no value is built, so a
 * long chain of `calc()`s costs no more than its references.
 */
export function referenceCycles(
  set: TokenSet,
  changed: readonly string[],
): ThemeError[] {
  const errors: ThemeError[] = []
  for (const path of changed) {
    const chain = loopFrom(set, path.replace('.', '-'))
    if (chain && !errors.some((e) => sameLoop(e, chain)))
      errors.push(cycleError(path, chain))
  }
  return errors
}

function loopFrom(set: TokenSet, property: string): string[] | undefined {
  for (const scheme of ['light', 'dark'] as const) {
    const chain = new LoopSearch(set, scheme).from(property, [])
    if (chain) return chain
  }
  return undefined
}

/** A depth-first walk of one scheme's references; a name met again on the way is a loop. */
class LoopSearch {
  private readonly finished = new Set<string>()

  constructor(
    private readonly set: TokenSet,
    private readonly scheme: ColorScheme,
  ) {}

  from(property: string, path: readonly string[]): string[] | undefined {
    const at = path.indexOf(property)
    if (at >= 0) return [...path.slice(at), property]
    if (this.finished.has(property)) return undefined
    for (const next of this.next(property)) {
      const loop = this.from(next, [...path, property])
      if (loop) return loop
    }
    this.finished.add(property)
    return undefined
  }

  /** The names a token's value points to, on this scheme's side. */
  private next(property: string): string[] {
    const found = this.set.find(property)
    if (!found) return []
    const side = isLightDark(found.value)
      ? found.value[this.scheme]
      : found.value
    const css = cssValue(found.type, side)
    return css === undefined ? [] : referencesIn(css)
  }
}

function sameLoop(error: ThemeError, chain: readonly string[]): boolean {
  return error.code === 'referenceCycle' && error.data.chain.includes(chain[0]!)
}

function cycleError(path: string, chain: readonly string[]): ThemeError {
  const message = `${path}: ${new ReferenceCycle(chain).message.replace(/^glyph: /, '')}`
  return { path, code: 'referenceCycle', data: { chain }, message }
}
