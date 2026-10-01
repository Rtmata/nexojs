import type { Params } from './types'

/**
 * A route path, parsed once at registration:
 *
 *   '/consola/:id/*'  →  [static 'consola', param 'id', wildcard]
 */
export interface Pattern {
  path: string
  segments: Segment[]
}

export type Segment =
  | { kind: 'static'; value: string }
  | { kind: 'param'; name: string }
  | { kind: 'wildcard' }

/** Parse and validate a route path. Throws on anything ambiguous or malformed. */
export function parsePattern(path: string): Pattern {
  if (!path.startsWith('/')) {
    throw new Error(`boat: route "${path}" must start with "/"`)
  }

  const parts = splitPath(path)
  const names = new Set<string>()

  const segments = parts.map((part, index): Segment => {
    if (part === '*') {
      if (index !== parts.length - 1) {
        throw new Error(`boat: "*" can only be the last segment in "${path}"`)
      }
      return { kind: 'wildcard' }
    }

    if (part.startsWith(':')) {
      const name = part.slice(1)
      if (!name) throw new Error(`boat: empty parameter name in "${path}"`)
      if (names.has(name)) {
        throw new Error(`boat: parameter ":${name}" is repeated in "${path}"`)
      }
      names.add(name)
      return { kind: 'param', name }
    }

    return { kind: 'static', value: part }
  })

  return { path, segments }
}

/**
 * Split a pathname into segments. The root is no segments at all, and a
 * trailing slash is ignored: '/' → [], '/consola/nes' → ['consola', 'nes'].
 */
export function splitPath(pathname: string): string[] {
  const parts = pathname.split('/').slice(1)
  if (parts.at(-1) === '') parts.pop()
  return parts
}

/**
 * Try a pattern against already-split path segments.
 * Returns the captured params, or `null` if it does not match.
 */
export function matchPattern(pattern: Pattern, parts: string[]): Params | null {
  const params: Params = {}

  for (const [index, segment] of pattern.segments.entries()) {
    if (segment.kind === 'wildcard') {
      // Captures everything left, including nothing: '/covers/*' matches '/covers'.
      params['*'] = parts.slice(index).map(decode).join('/')
      return params
    }

    const part = parts[index]
    if (part === undefined) return null

    if (segment.kind === 'static') {
      if (decode(part) !== segment.value) return null
    } else {
      params[segment.name] = decode(part)
    }
  }

  // Every segment matched; the path must not have leftovers.
  return parts.length === pattern.segments.length ? params : null
}

/**
 * The shape of a pattern with names erased. Two routes with the same shape
 * match exactly the same URLs, so registering both is ambiguous:
 *
 *   '/consola/:id'  and  '/consola/:slug'  →  both 'consola/:'
 */
export function shapeOf(pattern: Pattern): string {
  return pattern.segments
    .map((s) =>
      s.kind === 'static' ? s.value : s.kind === 'param' ? ':' : '*',
    )
    .join('/')
}

const RANK = { static: 3, param: 2, wildcard: 1 } as const

/**
 * Order two patterns by specificity, segment by segment:
 * static beats param, param beats wildcard. Returns a positive number when
 * `a` is more specific than `b`.
 */
export function compareSpecificity(a: Pattern, b: Pattern): number {
  const length = Math.max(a.segments.length, b.segments.length)
  for (let i = 0; i < length; i++) {
    const rankA = a.segments[i] ? RANK[a.segments[i]!.kind] : 0
    const rankB = b.segments[i] ? RANK[b.segments[i]!.kind] : 0
    if (rankA !== rankB) return rankA - rankB
  }
  return 0
}

/** Decode a URL segment; a malformed escape is kept as written instead of throwing. */
function decode(part: string): string {
  try {
    return decodeURIComponent(part)
  } catch {
    return part
  }
}

/**
 * The opposite of matching: build a pathname from a pattern and params.
 * Values are URL-encoded; a missing or unknown param throws, so a broken
 * link fails loudly instead of pointing somewhere wrong.
 *
 *   fillPattern(parsePattern('/consola/:id'), { id: 'nes' })  →  '/consola/nes'
 */
export function fillPattern(
  pattern: Pattern,
  params: Record<string, string | number> = {},
): string {
  const used = new Set<string>()
  const parts = pattern.segments.flatMap((segment) => {
    if (segment.kind === 'static') return [encodeURIComponent(segment.value)]
    const name = segment.kind === 'param' ? segment.name : '*'
    const value = params[name]
    if (value === undefined || value === '') {
      if (segment.kind === 'wildcard') return []
      throw new Error(
        `boat: "${pattern.path}" needs the param "${name}" to build a link`,
      )
    }
    used.add(name)
    if (segment.kind === 'wildcard') {
      return String(value).split('/').map(encodeURIComponent)
    }
    return [encodeURIComponent(String(value))]
  })

  const unknown = Object.keys(params).filter((name) => !used.has(name))
  if (unknown.length > 0) {
    throw new Error(
      `boat: "${pattern.path}" has no param ${unknown.map((n) => `"${n}"`).join(', ')}`,
    )
  }
  return '/' + parts.join('/')
}
