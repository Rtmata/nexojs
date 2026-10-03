import { decodeSegment, hasSeparator, splitSegments } from '../url/decode'
import { quoted } from './quoted'
import type { LinkParams, Params } from './types'

export type Segment =
  | { kind: 'static'; value: string }
  | { kind: 'param'; name: string }
  | { kind: 'wildcard' }

/**
 * How specific a segment is: static beats param, param beats wildcard. A
 * path that ends (`end`) beats a wildcard that captures nothing:
 * `/covers` answers `/covers` before `/covers/*` does.
 */
const RANK = { static: 4, param: 3, end: 2, wildcard: 1 } as const

/**
 * A route path, parsed once at registration:
 *
 *   new Pattern('/consola/:id/*')  →  [static 'consola', param 'id', wildcard]
 *
 * It answers the three questions the router asks of a path: does this URL
 * match (`match`), what URL do these params make (`fill`), and which of two
 * paths is more specific (`compare`). Immutable.
 */
export class Pattern {
  readonly segments: readonly Segment[]
  /** The path with names erased: same shape = same URLs ('=consola/:'). */
  readonly shape: string
  /** The params it captures, `*` for a wildcard. */
  readonly params: readonly string[]

  constructor(readonly path: string) {
    if (!path.startsWith('/')) {
      throw new Error(
        `boat: route "${path}" must start with "/". Write it as "/${path}"`,
      )
    }
    this.segments = parseSegments(path)
    this.shape = this.segments.map(shapeOf).join('/')
    this.params = this.segments.flatMap(paramOf)
  }

  /**
   * The params a URL gives, or `null` when it doesn't match. `parts` are
   * the URL's segments, already decoded (see `decodedSegments`).
   */
  match(parts: readonly string[]): Params | null {
    const params: Params = {}
    for (const [index, segment] of this.segments.entries()) {
      // A wildcard takes everything left, even nothing: '/covers/*' ↔ '/covers'.
      if (segment.kind === 'wildcard') return withRest(params, parts, index)
      if (!matchSegment(segment, parts[index], params)) return null
    }
    return parts.length === this.segments.length ? params : null
  }

  /**
   * The URL these params make. Missing, unknown or dot-segment values throw:
   * a broken link fails loudly instead of pointing somewhere wrong.
   */
  fill(values: LinkParams = {}): string {
    const unknown = Object.keys(values).filter((n) => !this.params.includes(n))
    if (unknown.length > 0) {
      throw new Error(
        `boat: "${this.path}" has no param ${quoted(unknown)}. Give only the params its path names`,
      )
    }
    return (
      '/' + this.segments.flatMap((s) => this.fillSegment(s, values)).join('/')
    )
  }

  /** Only the params this pattern uses, so a URL with more still links. */
  pick(values: Params): Params {
    return Object.fromEntries(
      this.params
        .filter((n) => values[n] !== undefined)
        .map((n) => [n, values[n]!]),
    )
  }

  /** Positive when this pattern is more specific than `other`. */
  compare(other: Pattern): number {
    const length = Math.max(this.segments.length, other.segments.length)
    for (let i = 0; i < length; i++) {
      const order = rankAt(this, i) - rankAt(other, i)
      if (order !== 0) return order
    }
    return 0
  }

  private fillSegment(segment: Segment, values: LinkParams): string[] {
    if (segment.kind === 'static') return [encodeURIComponent(segment.value)]
    const name = segment.kind === 'param' ? segment.name : '*'
    const value = this.valueFor(segment, name, values)
    if (value === undefined) return [] // '/covers' captured '*' as ''
    const parts = segment.kind === 'wildcard' ? value.split('/') : [value]
    return parts.map((part) => this.encode(part, name, value))
  }

  /** A param's value as text; a missing one is fine only for a wildcard. */
  private valueFor(segment: Segment, name: string, values: LinkParams) {
    const value = values[name]
    if (value !== undefined && value !== '') return String(value)
    if (segment.kind === 'wildcard') return undefined
    throw new Error(
      `boat: "${this.path}" needs the param "${name}" to build a link. Pass it in the params`,
    )
  }

  /** '.' and '..' survive encoding and browsers collapse them: refuse. */
  private encode(part: string, name: string, value: string | number): string {
    if (part === '.' || part === '..') {
      throw new Error(
        `boat: "${this.path}" can't take "${value}" as "${name}": it would point somewhere else`,
      )
    }
    return encodeURIComponent(part)
  }
}

function parseSegments(path: string): Segment[] {
  const parts = splitSegments(path)
  const names = new Set<string>()
  return parts.map((part, i) =>
    parseSegment(part, i === parts.length - 1, names, path),
  )
}

function parseSegment(
  part: string,
  last: boolean,
  names: Set<string>,
  path: string,
): Segment {
  if (part === '*') {
    if (!last)
      throw new Error(
        `boat: "*" can only be the last segment in "${path}". Move it to the end, or use a :param`,
      )
    return { kind: 'wildcard' }
  }
  if (part.startsWith(':')) return paramSegment(part.slice(1), names, path)
  return staticSegment(decodeSegment(part), path)
}

/**
 * Stored decoded, as URLs are compared: '/caf%C3%A9' is the path '/café'.
 * A segment no URL can match is refused now, not found dead later.
 */
function staticSegment(value: string, path: string): Segment {
  if (value === '.' || value === '..')
    throw badSegment(
      `"${path}" has a "${value}" segment, which browsers collapse. Write the path it means`,
    )
  if (hasSeparator(value))
    throw badSegment(
      `"${path}" has a segment holding "/" or "\\", which no URL can match. Split it into segments`,
    )
  return { kind: 'static', value }
}

function badSegment(problem: string): Error {
  return new Error(`boat: ${problem}`)
}

function paramSegment(name: string, names: Set<string>, path: string): Segment {
  if (!name)
    throw badParam(`empty parameter name in "${path}". Name it, like ":id"`)
  if (names.has(name))
    throw badParam(
      `parameter ":${name}" is repeated in "${path}". Give each param its own name`,
    )
  names.add(name)
  return { kind: 'param', name }
}

function badParam(problem: string): Error {
  return new Error(`boat: ${problem}`)
}

/** Whether one URL segment fits one pattern segment; records a param's value. */
function matchSegment(
  segment: Segment,
  part: string | undefined,
  params: Params,
): boolean {
  if (part === undefined) return false
  if (segment.kind === 'static') return part === segment.value
  // '/consolas//info' has an empty segment: that's no value for :id.
  if (part === '' || segment.kind !== 'param') return false
  params[segment.name] = part
  return true
}

/** The params plus `*`: every part left. */
function withRest(params: Params, parts: readonly string[], from: number) {
  return { ...params, '*': parts.slice(from).join('/') }
}

/**
 * A static value is marked and encoded ('=%3A'), so it can never read as a
 * param (':'), a wildcard ('*') or a segment break ('/').
 */
function shapeOf(segment: Segment): string {
  if (segment.kind === 'static') return '=' + encodeURIComponent(segment.value)
  return segment.kind === 'param' ? ':' : '*'
}

function paramOf(segment: Segment): string[] {
  if (segment.kind === 'param') return [segment.name]
  return segment.kind === 'wildcard' ? ['*'] : []
}

function rankAt(pattern: Pattern, index: number): number {
  const segment = pattern.segments[index]
  return segment ? RANK[segment.kind] : RANK.end
}
