import { isContainer, shown, type Group } from './group'

/**
 * A frozen copy of plain groups and lists, all the way down. Functions are
 * shared as they are, and so are other objects (a `Date`, a class
 * instance): freezing them could break them, so keep them unchanged. Keys
 * are copied as own data, so a `__proto__` key from JSON stays a key.
 *
 *   const copy = FrozenCopy.of({ nav: { home: 'Home' } })
 *
 * Each group is copied once, however many places reuse it, so the copy
 * keeps the sharing. A group that contains itself, or a getter (a message
 * that changes by itself), is refused with a clear error.
 */
export class FrozenCopy {
  private readonly copies = new Map<object, unknown>()
  /** The groups above the one being copied: reaching one again is a cycle. */
  private readonly ancestors = new Set<object>()
  /** Getters found on the way, all reported at once at the end. */
  private readonly getters: string[][] = []

  private constructor() {}

  /** The frozen copy of `value`. Nothing outside it changes. */
  static of(value: unknown): unknown {
    const copier = new FrozenCopy()
    const copy = copier.copyOf(value, [])
    copier.ensureNoGetters()
    return copy
  }

  private copyOf(value: unknown, path: readonly string[]): unknown {
    if (!isContainer(value)) return value
    if (this.ancestors.has(value)) throw cycleAt(path)
    return this.copies.get(value) ?? this.copyContainer(value, path)
  }

  private copyContainer(value: unknown[] | Group, path: readonly string[]) {
    this.ancestors.add(value)
    const entries = this.entriesOf(value, path).map(
      ([key, inner]) => [key, this.copyOf(inner, [...path, key])] as const,
    )
    this.ancestors.delete(value)
    const copy = Array.isArray(value)
      ? entries.map(([, inner]) => inner)
      : Object.fromEntries(entries)
    this.copies.set(value, Object.freeze(copy))
    return copy
  }

  /** Its entries as data, holes in a list included (as undefined); getters are noted. */
  private entriesOf(value: unknown[] | Group, path: readonly string[]) {
    const keys = Array.isArray(value)
      ? [...value.keys()].map(String)
      : Object.keys(value)
    return keys.map((key): [string, unknown] => [
      key,
      this.dataOf(value, key, path),
    ])
  }

  private dataOf(
    value: unknown[] | Group,
    key: string,
    path: readonly string[],
  ) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor || 'value' in descriptor) return descriptor?.value
    this.getters.push([...path, key])
    return undefined
  }

  private ensureNoGetters(): void {
    if (this.getters.length === 0) return
    const list = this.getters.map((path) => `"${shown(path)}"`).join(', ')
    throw new Error(
      `voices: ${list} ${this.getters.length === 1 ? 'is a getter' : 'are getters'}, but messages are values and functions, and each language is a plain object. Write a changing message as a function: () => …`,
    )
  }
}

function cycleAt(path: readonly string[]): Error {
  return new Error(
    `voices: "${shown(path)}" points back to a group that contains it. Messages must be a tree: copy the group instead`,
  )
}
