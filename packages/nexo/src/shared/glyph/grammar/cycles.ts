import { ReferenceCycle, Resolver } from '../resolver'
import type { ThemeError } from '../theme-error'
import type { TokenSet } from '../token-set'

/**
 * The reference loops a person's changes make, one per loop, at the
 * first changed token that runs into it: `color.surface` → `color.primary`
 * → `color.surface`. Followed in both schemes, since `{ light, dark }` may
 * loop on one side only. Other dead ends are the tokens' own, from code:
 * contrast reports them.
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

function loopFrom(
  set: TokenSet,
  property: string,
): readonly string[] | undefined {
  for (const scheme of ['light', 'dark'] as const) {
    try {
      new Resolver(set, scheme).value(property)
    } catch (error) {
      if (error instanceof ReferenceCycle) return error.chain
    }
  }
  return undefined
}

function sameLoop(error: ThemeError, chain: readonly string[]): boolean {
  return error.code === 'referenceCycle' && error.data.chain.includes(chain[0]!)
}

function cycleError(path: string, chain: readonly string[]): ThemeError {
  const message = `${path}: ${new ReferenceCycle(chain).message.replace(/^glyph: /, '')}`
  return { path, code: 'referenceCycle', data: { chain }, message }
}
