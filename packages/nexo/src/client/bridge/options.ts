import { enclosingSegment, inherited } from './attributes'
import { focusOf, type Focus } from './focus'
import { targetOf, type Target } from './target'

/**
 * Everything a link or form says about how to navigate, each value read
 * with the one inheritance rule (its own attribute, else the closest
 * ancestor's). Unknown values are reported and fall back to the default,
 * so a typo never breaks a page silently.
 */
export interface Options {
  target: Target
  /** `push` or `replace` the URL; a whole page pushes by default, segments record nothing. */
  history: 'push' | 'replace' | null
  /** `keep` the scroll (default for segments), go to the `top`, or to the `target`. */
  scroll: 'top' | 'keep' | 'target'
  /** `replace` the segment (default), or `append`/`prepend` the new content inside it. */
  swap: 'replace' | 'append' | 'prepend'
  /** Where the focus goes afterwards: `auto` by default (see `FocusMove`). */
  focus: Focus
  transition: boolean
  /** The segment that shows error responses instead of the target. */
  fail: string | null
  /** Another segment marked busy while loading: a global indicator. */
  busy: string | null
}

/** `target`: the one the options are for; the element's own (read like any attribute) unless the caller has another in mind, as lazy content does. */
export function optionsOf(
  element: Element,
  target: Target = targetFor(element),
): Options {
  return {
    target,
    ...modesOf(element, target.kind),
    focus: focusOf(inherited(element, 'focus')),
    transition: inherited(element, 'transition') === 'true',
    fail: inherited(element, 'fail'),
    busy: inherited(element, 'busy'),
  }
}

function targetFor(element: Element): Target {
  return targetOf(inherited(element, 'target'), enclosingSegment(element))
}

/** The three attributes with a fixed set of values. Their defaults follow the target: a whole page makes an entry and starts at the top, a segment makes none and keeps the scroll. */
function modesOf(element: Element, kind: Target['kind']) {
  const top = kind === 'top'
  return {
    history: oneOf(element, 'history', HISTORY, top ? 'push' : null),
    scroll: oneOf(element, 'scroll', SCROLL, top ? 'top' : 'keep'),
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
