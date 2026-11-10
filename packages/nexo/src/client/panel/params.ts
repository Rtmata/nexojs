/**
 * A param's parser (D.3): how one `data-<panel>-<key>` attribute becomes a
 * typed value, and the value when the attribute is missing. Plain functions
 * build them; one schema types the code and parses the markup.
 */
export interface Param<T> {
  /** The attribute's text, or `null` when it's missing. */
  parse(text: string | null, where: string): T
  /** The other way, for server markup (R.23): the text, `true` for a bare attribute, `null` to leave it out. */
  write(value: T): string | true | null
}

/** What a schema's params are, typed from its parsers. */
export type ParamsOf<S> = {
  [K in keyof S]: S[K] extends Param<infer T> ? T : never
}

export function number(fallback: number): Param<number> {
  const write = (n: number) => (Number.isFinite(n) ? String(n) : null) // non-finite: left out, the fallback applies
  return param(fallback, 'a number', write, (text) => {
    const n = Number(text)
    return text.trim() !== '' && Number.isFinite(n) ? { value: n } : undefined
  })
}

/**
 * Presence is `true` (HTML's own rule for boolean attributes), and the one
 * text that means `false` is `"false"`: how a param whose fallback is
 * `true` is turned off in markup (`data-x-open="false"`), so `markup()` and
 * `attach` agree whatever the fallback.
 */
export function boolean(fallback = false): Param<boolean> {
  return {
    parse: (text) => (text === null ? fallback : text !== 'false'),
    write: (value) => (value === fallback ? null : value ? true : 'false'),
  }
}

export function string(fallback = ''): Param<string> {
  return { parse: (text) => text ?? fallback, write: (value) => value }
}

/** Arrays and objects, as JSON in the attribute. */
/** Arrays and objects, as JSON in the attribute; `shape` says what the JSON must be (`'array'`, `'object'`). */
export function json<T>(fallback: T, shape?: 'array' | 'object'): Param<T> {
  const expected = shape
    ? `JSON (${shape === 'array' ? 'an array' : 'an object'})`
    : 'JSON'
  return param(
    fallback,
    expected,
    (value) => JSON.stringify(value),
    (text) => parseJson<T>(text, shape),
  )
}

function parseJson<T>(
  text: string,
  shape?: 'array' | 'object',
): { value: T } | undefined {
  try {
    const value = JSON.parse(text) as T
    return isShape(value, shape) ? { value } : undefined
  } catch {
    return undefined
  }
}

function isShape(value: unknown, shape?: 'array' | 'object'): boolean {
  if (shape === 'array') return Array.isArray(value)
  if (shape === 'object')
    return typeof value === 'object' && value !== null && !Array.isArray(value)
  return true
}

/** One of a fixed list of words. */
export function oneOf<const W extends string>(
  words: readonly W[],
  fallback: W,
): Param<W> {
  return param(fallback, `one of ${words.join(', ')}`, String, (text) =>
    words.includes(text as W) ? { value: text as W } : undefined,
  )
}

/**
 * Missing → the fallback; present but not parsable → reported (an error
 * that names where: `panel: gallery.start: expected a number`) and the
 * fallback stands, so the panel still works: markup reports, JS throws
 * (audit item 4).
 */
function param<T>(
  fallback: T,
  expected: string,
  write: (value: T) => string | true | null,
  read: (text: string) => { value: T } | undefined,
): Param<T> {
  return {
    parse(text, where) {
      if (text === null) return fallback
      const message = `panel: ${where}: expected ${expected}, got "${text}"`
      const parsed = read(text) // a value may be null itself (JSON's `null`): only no result is a failure
      return parsed ? parsed.value : wrong(fallback, message)
    },
    write,
  }
}

/** Every param of a schema, read from an element's `data-<name>-<key>` attributes. */
export function readParams<S extends Record<string, Param<unknown>>>(
  schema: S,
  name: string,
  el: Element,
): ParamsOf<S> {
  const params: Record<string, unknown> = {}
  for (const [key, parser] of Object.entries(schema))
    params[key] = parser.parse(
      el.getAttribute(attributeOf(name, key)),
      `${name}.${key}`,
    )
  return params as ParamsOf<S>
}

/** `gallery` + `autoPlay` → `data-gallery-auto-play`: as `dataset` names them. */
export function attributeOf(name: string, key: string): string {
  return `data-${name}-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`
}

/** A wrong value in markup: reported, and the fallback stands (audit item 4). */
function wrong<T>(fallback: T, message: string): T {
  reportError(new Error(message))
  return fallback
}
