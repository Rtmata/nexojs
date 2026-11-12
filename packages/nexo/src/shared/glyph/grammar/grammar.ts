import { readColor } from '../color/read'
import type { TokenSet } from '../token-set'
import type { TokenType } from '../typed'
import { References, WRONG, type Issue } from './issue'
import { MATH, mathKind } from './math'
import { dimensionOf, isLength, numberOf } from './numbers'
import { splitTop } from './split'

/**
 * Each type's grammar, for values a person typed: only what reads as
 * that type passes, so nothing else can reach the CSS. Every slot of a
 * type also takes `var(--token)` of that type, the theme's own or a
 * palette's. Values are text here; numbers were checked by kind before.
 */
export class Grammar {
  private readonly references: References

  constructor(set: TokenSet) {
    this.references = new References(set)
  }

  /** Nothing when `text` reads as `type`, else why not. */
  issue(type: TokenType, text: string): Issue | undefined {
    if (this.references.is(text)) return this.references.check(text, type)
    return this.readers[type](text)
  }

  private readonly readers: Record<
    TokenType,
    (text: string) => Issue | undefined
  > = {
    color: (text) => this.color(text),
    dimension: (text) => this.length(text),
    fontFamily: (text) => fontFamily(text),
    fontWeight: (text) => fontWeight(text),
    shadow: (text) => this.shadow(text),
    duration: () => WRONG, // a number, or a reference
    easing: (text) => easing(text),
    number: () => WRONG,
  }

  /** A colour glyph can read, so its contrast can be measured. */
  private color(text: string): Issue | undefined {
    try {
      readColor(text)
      return undefined
    } catch {
      return WRONG
    }
  }

  /** A length, a percentage, `0`, or math that comes to a length. */
  /** Its callers take a whole reference first. */
  private length(text: string): Issue | undefined {
    if (MATH.test(text)) return lengthFrom(mathKind(text, this.references))
    const found = dimensionOf(text)
    return found && isLength(found) ? undefined : WRONG
  }

  /** Layers by commas: `inset`, two to four lengths together, a colour; any order. */
  private shadow(text: string): Issue | undefined {
    const layers = splitTop(text, ',')
    if (!layers) return WRONG
    for (const layer of layers) {
      const issue = this.layer(layer)
      if (issue) return issue
    }
    return undefined
  }

  private layer(layer: string): Issue | undefined {
    const parts = splitTop(layer, ' ')
    if (!parts || parts.length === 0) return WRONG
    const roles = parts.map((part) => this.role(part))
    const issue = roles.find((role): role is Issue => typeof role !== 'string')
    if (issue) return issue
    return shadowShape(roles as Role[], parts)
  }

  /** What one part of a shadow layer is. */
  private role(part: string): Role | Issue {
    if (part.toLowerCase() === 'inset') return 'inset'
    if (this.references.is(part)) return this.referredRole(part)
    if (this.length(part) === undefined) return 'length'
    return this.color(part) === undefined ? 'color' : WRONG
  }

  private referredRole(part: string): Role | Issue {
    const type = this.references.typeOf(part)
    if (type === 'dimension') return 'length'
    if (type === 'color') return 'color'
    if (typeof type !== 'string') return type
    return { kind: 'mistyped', name: part.slice(6, -1), type }
  }
}

type Role = 'inset' | 'length' | 'color'

/** At most one inset and one colour; two to four lengths side by side, the blur not negative. */
function shadowShape(roles: Role[], parts: string[]): Issue | undefined {
  if (!fitsShadow(roles)) return WRONG
  const blur = dimensionOf(parts[roles.indexOf('length') + 2] ?? '')
  return blur && blur.value < 0 ? WRONG : undefined
}

/** At most one inset and one colour; two to four lengths, side by side. */
function fitsShadow(roles: Role[]): boolean {
  const count = (role: Role) => roles.filter((r) => r === role).length
  const lengths = count('length')
  const few = count('inset') <= 1 && count('color') <= 1
  return few && lengths >= 2 && lengths <= 4 && adjacent(roles, lengths)
}

/** The lengths come one after another, nothing between them. */
function adjacent(roles: Role[], lengths: number): boolean {
  const first = roles.indexOf('length')
  return roles.slice(first, first + lengths).every((r) => r === 'length')
}

function lengthFrom(kind: ReturnType<typeof mathKind>): Issue | undefined {
  if (kind === 'length') return undefined
  return kind === 'number' ? WRONG : kind
}

/** Words CSS keeps for itself: never a family name unquoted. */
const CSS_WIDE = new Set([
  'initial',
  'inherit',
  'unset',
  'revert',
  'revert-layer',
  'default',
])

/** An identifier: letters (any script), digits, `-`, `_`; not starting with a digit. */
const IDENT = /^-?[A-Za-z_\u0080-￿][A-Za-z0-9_\u0080-￿-]*$/

/** A family per comma: a quoted name, words, or `generic(name)` (CSS Fonts 4). */
function fontFamily(text: string): Issue | undefined {
  const families = splitTop(text, ',')
  if (!families) return WRONG
  return families.every(isFamily) ? undefined : WRONG
}

function isFamily(family: string): boolean {
  if (/^"[^"]*"$|^'[^']*'$/.test(family)) return true
  const generic = /^generic\(\s*(.+?)\s*\)$/i.exec(family)
  if (generic) return IDENT.test(generic[1]!)
  const words = family.split(/\s+/)
  return (
    words.every((word) => IDENT.test(word)) &&
    !CSS_WIDE.has(words[0]!.toLowerCase())
  )
}

const WEIGHTS = new Set(['normal', 'bold', 'lighter', 'bolder'])

/** 1 to 1000, or a keyword. */
function fontWeight(text: string): Issue | undefined {
  if (WEIGHTS.has(text.toLowerCase())) return undefined
  const weight = numberOf(text)
  return weight !== undefined && weight >= 1 && weight <= 1000
    ? undefined
    : WRONG
}

const EASINGS = new Set([
  'linear',
  'ease',
  'ease-in',
  'ease-out',
  'ease-in-out',
  'step-start',
  'step-end',
])

const EASING_FUNCTIONS: Record<string, (args: string[]) => boolean> = {
  'cubic-bezier': cubicBezier,
  steps,
  linear: linearStops,
}

/** A keyword, `cubic-bezier()`, `steps()` or `linear()` (CSS Easing 2). */
function easing(text: string): Issue | undefined {
  if (EASINGS.has(text.toLowerCase())) return undefined
  const call = /^([a-z-]+)\((.*)\)$/is.exec(text)
  const read = call && EASING_FUNCTIONS[call[1]!.toLowerCase()]
  const args = call && splitTop(call[2]!, ',')
  return read && args && read(args) ? undefined : WRONG
}

/** Four numbers; the x of each point between 0 and 1. */
function cubicBezier(args: string[]): boolean {
  const numbers = args.map(numberOf)
  if (numbers.length !== 4 || numbers.includes(undefined)) return false
  const [x1, , x2] = numbers as number[]
  return [x1!, x2!].every((x) => x >= 0 && x <= 1)
}

const STEP_POSITIONS = new Set([
  'jump-start',
  'jump-end',
  'jump-none',
  'jump-both',
  'start',
  'end',
])

/** A whole count, then maybe a position; `jump-none` needs two steps or more. */
function steps([count, position, ...rest]: string[]): boolean {
  const n = numberOf(count ?? '')
  if (rest.length > 0 || n === undefined || !Number.isInteger(n) || n < 1)
    return false
  if (position === undefined) return true
  const where = position.toLowerCase()
  return STEP_POSITIONS.has(where) && (where !== 'jump-none' || n >= 2)
}

/** Two stops or more, each a number and up to two percentages. */
function linearStops(stops: string[]): boolean {
  return stops.length >= 2 && stops.every(isStop)
}

function isStop(stop: string): boolean {
  const parts = stop.split(/\s+/).map(dimensionOf)
  const numbers = parts.filter((p) => p?.unit === '').length
  const percents = parts.filter((p) => p?.unit === '%').length
  return parts.every(Boolean) && numbers === 1 && percents <= 2
}
