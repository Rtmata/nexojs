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
  return param(fallback, 'a number', String, (text) => {
    const n = Number(text)
    return text.trim() !== '' && Number.isFinite(n) ? { value: n } : undefined
  })
}

/** Presence is `true` (HTML's own rule for boolean attributes). */
export function boolean(fallback = false): Param<boolean> {
  return {
    parse: (text) => (text === null ? fallback : true),
    write: (value) => (value ? true : null),
  }
}

export function string(fallback = ''): Param<string> {
  return { parse: (text) => text ?? fallback, write: (value) => value }
}

/** Arrays and objects, as JSON in the attribute. */
export function json<T>(fallback: T): Param<T> {
  return param(fallback, 'JSON', (value) => JSON.stringify(value), parseJson<T>)
}

function parseJson<T>(text: string): { value: T } | undefined {
  try {
    return { value: JSON.parse(text) as T }
  } catch {
    return undefined
  }
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
 * Missing → the fallback; present but not parsable → an error that names
 * where (`gallery.start: expected a number`).
 */
function param<T>(
  fallback: T,
  expected: string,
  write: (value: T) => string,
  read: (text: string) => { value: T } | undefined,
): Param<T> {
  return {
    parse(text, where) {
      if (text === null) return fallback
      const parsed = read(text)
      if (!parsed)
        throw new Error(`${where}: expected ${expected}, got "${text}"`)
      return parsed.value
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
