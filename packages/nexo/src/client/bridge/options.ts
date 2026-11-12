import { enclosingSegment, inherited } from './attributes'
import {
  transitionSays,
  type ReturnDirection,
  type TransitionSays,
} from './change'
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
  /** `push` or `replace` the URL; a whole page pushes by default, segments record nothing; `none` records nothing. */
  history: 'push' | 'replace' | null
  /** `keep` the scroll (default for segments), go to the `top`, or to the `target`. */
  scroll: 'top' | 'keep' | 'target'
  /** `replace` the segment (default), or `append`/`prepend` the new content inside it. */
  swap: 'replace' | 'append' | 'prepend'
  /** Where the focus goes afterwards: `auto` by default (see `FocusMove`). */
  focus: Focus
  /** Snapshots or live, and the types. */
  transition: TransitionSays
  /** Set by a return through history; otherwise it follows `history`. */
  direction?: ReturnDirection
  /** The segment that shows error responses instead of the target; `_none`: none, whatever an ancestor says. */
  fail: string | null
  /** Another segment marked busy while loading: a global indicator; `_none`: none. */
  busy: string | null
  /** A request that changes something and got no response is sent once more with the same key (true by default); `data-bridge-retry="false"` turns it off. */
  retry: boolean
}

/**
 * The same choices, written by hand for `visit()`, `reload()` and
 * `prefetch()`: the attributes' words, without the `data-bridge-`. What
 * is left out takes the attribute's default. `target` is segment names
 * (one, or a list) or `_top`; left out, the segment `from` sits in, else
 * the whole page. `from` is the element the events fire on and the
 * attributes around it are read from: the body by default. `null` says
 * "none" on purpose (no history, no fail or busy segment), whatever the
 * markup says; left out, the markup around `from` decides.
 */
export interface VisitOptions {
  target?: string | readonly string[]
  history?: 'push' | 'replace' | null
  scroll?: 'top' | 'keep' | 'target'
  swap?: 'replace' | 'append' | 'prepend'
  /** `auto`, `keep`, `autofocus`, `target`, `none`, or a segment name. */
  focus?: string
  /** `true` snapshots, `false` live, a string: snapshots with these types. */
  transition?: boolean | string
  fail?: string | null
  busy?: string | null
  retry?: boolean
  from?: Element
  /** Aborting cancels the visit (as a newer navigation would); a prefetch stops being waited for. */
  signal?: AbortSignal
}

/** `target`: the one the options are for; the element's own (read like any attribute) unless the caller has another in mind, as lazy content does. */
export function optionsOf(
  element: Element,
  target: Target = targetFor(element),
): Options {
  const read = (role: string) => inherited(element, role)
  return optionsRead(target, read, reported)
}

/** The options an object gives, the rest read around `from` as a link there would: a wrong value the script gave throws, a wrong one from the markup is reported. */
export function optionsFrom(given: VisitOptions, from: Element): Options {
  const target = givenTarget(given.target, from)
  const own = given as Record<string, unknown> // read by role name, never written
  const has = (role: string) => own[role] !== undefined
  const read = (role: string) =>
    has(role) ? asAttribute(own[role], role) : inherited(from, role)
  const complain: Complain = (role, message) =>
    (has(role) ? thrown : reported)(role, message)
  return optionsRead(target, read, complain)
}

/** `true` reads as a bare attribute; `null` as the role's own word for none. */
function asAttribute(value: unknown, role: string): string {
  if (value === null) return NONE[role] ?? 'null'
  return value === true ? '' : String(value)
}

/** How markup says "none" where a script says `null`: a word where the values are words, `_none` where they are segment names (as `target`). */
const NONE: Record<string, string> = {
  history: 'none',
  fail: '_none',
  busy: '_none',
}

/** `target` as written for a link (`"shelf, counter"`, `_top`); left out, like a link in `from`, but the whole page outside every segment. */
function givenTarget(target: VisitOptions['target'], from: Element): Target {
  if (target === undefined)
    return enclosingSegment(from) ? targetFor(from) : { kind: 'top' }
  const written = Array.isArray(target) ? target.join(',') : String(target)
  return targetOf(written, null)
}

function targetFor(element: Element): Target {
  return targetOf(inherited(element, 'target'), enclosingSegment(element))
}

/** Every option by one reader (an attribute, or a value given by hand), with the defaults that follow the target: a whole page makes an entry and starts at the top, a segment makes none and keeps the scroll. */
function optionsRead(
  target: Target,
  read: Reader,
  complain: Complain,
): Options {
  return {
    target,
    ...modesRead(read, target.kind === 'top', complain),
    focus: focusOf(read('focus')),
    transition: transitionSays(read('transition')),
    fail: segmentOrNone(read('fail')),
    busy: segmentOrNone(read('busy')),
    retry: read('retry') !== 'false',
  }
}

/** The three with a fixed set of values; `top`: the defaults of a whole page. */
function modesRead(read: Reader, top: boolean, complain: Complain) {
  return {
    history: noneIsNull(
      oneOf(read, 'history', HISTORY, top ? 'push' : null, complain),
    ),
    scroll: oneOf(read, 'scroll', SCROLL, top ? 'top' : 'keep', complain),
    swap: oneOf(read, 'swap', SWAP, 'replace', complain),
  }
}

/** The value of one role (`history`, `scroll`…), or null when nothing says. */
type Reader = (role: string) => string | null

const HISTORY = ['push', 'replace', 'none'] as const

function noneIsNull<V>(value: V | 'none'): V | null {
  return value === 'none' ? null : value
}

/** A segment's name, or null for `_none` and for nothing said. */
function segmentOrNone(value: string | null): string | null {
  return value === null || value.trim() === '_none' ? null : value
}
const SCROLL = ['top', 'keep', 'target'] as const
const SWAP = ['replace', 'append', 'prepend'] as const

function oneOf<V extends string, D>(
  read: Reader,
  role: string,
  allowed: readonly V[],
  fallback: D,
  complain: Complain,
): V | D {
  const value = read(role)
  if (value === null) return fallback
  if ((allowed as readonly string[]).includes(value.trim()))
    return value.trim() as V
  complain(
    role,
    `bridge: ${role} "${value}" is not one of ${allowed.join(', ')}`,
  )
  return fallback
}

/** What a wrong value of `role` does: markup reports it and the default stands; a script's call throws. Asked per role: a script's options mix its own values with the markup's around `from`. */
type Complain = (role: string, message: string) => void

const reported: Complain = (_, message) => reportError(new Error(message))

const thrown: Complain = (_, message) => {
  throw new TypeError(message)
}
