import { enclosingSegment, inherited } from './attributes'
import { targetOf, type Target } from './target'

/**
 * Everything a link or form says about how to navigate, each value read
 * with the one inheritance rule (its own attribute, else the closest
 * ancestor's). Unknown values are reported and fall back to the default,
 * so a typo never breaks a page silently.
 */
export interface Options {
  target: Target
  /** `push` or `replace` the URL; nothing by default for segments. */
  history: 'push' | 'replace' | null
  /** `keep` the scroll (default for segments), go to the `top`, or to the `target`. */
  scroll: 'top' | 'keep' | 'target'
  /** `replace` the segment (default), or `append`/`prepend` the new content inside it. */
  swap: 'replace' | 'append' | 'prepend'
  transition: boolean
  /** The segment that shows error responses instead of the target. */
  fail: string | null
  /** Another segment marked busy while loading: a global indicator. */
  busy: string | null
}

export function optionsOf(element: Element): Options {
  const target = targetFor(element)
  return {
    target,
    ...modesOf(element, target.kind === 'top' ? 'top' : 'keep'),
    transition: inherited(element, 'transition') === 'true',
    fail: inherited(element, 'fail'),
    busy: inherited(element, 'busy'),
  }
}

function targetFor(element: Element): Target {
  return targetOf(inherited(element, 'target'), enclosingSegment(element))
}

/** The three attributes with a fixed set of values; the page scrolls to the top by default, a segment keeps it. */
function modesOf(element: Element, scroll: 'top' | 'keep') {
  return {
    history: oneOf(element, 'history', HISTORY, null),
    scroll: oneOf(element, 'scroll', SCROLL, scroll),
    swap: oneOf(element, 'swap', SWAP, 'replace'),
  }
}

const HISTORY = ['push', 'replace'] as const
const SCROLL = ['top', 'keep', 'target'] as const
const SWAP = ['replace', 'append', 'prepend'] as const

function oneOf<V extends string, D>(
  element: Element,
  role: string,
  allowed: readonly V[],
  fallback: D,
): V | D {
  const value = inherited(element, role)
  if (value === null) return fallback
  if ((allowed as readonly string[]).includes(value.trim()))
    return value.trim() as V
  console.warn(
    `bridge: data-bridge-${role}="${value}" is not one of ${allowed.join(', ')}`,
  )
  return fallback
}
