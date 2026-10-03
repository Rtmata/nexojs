/** A group of messages: a plain object whose entries are messages or groups. */
export type Group = Record<string, unknown>

/** A plain object (not an array, Date, class instance…): a group of messages. */
export function isGroup(value: unknown): value is Group {
  if (value === null || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/** Groups and lists hold messages; anything else is one message. */
export function isContainer(value: unknown): value is Group | unknown[] {
  return isGroup(value) || Array.isArray(value)
}

/**
 * A message path as people write it: `nav.home`, `tips.0`. A key with a
 * dot in it is quoted, so it never reads as two: `nav["a.b"]`.
 */
export function shown(keys: readonly string[]): string {
  return keys
    .map((key, i) => (key.includes('.') ? `["${key}"]` : i ? `.${key}` : key))
    .join('')
}
