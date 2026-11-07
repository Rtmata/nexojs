/** Anything with a `.get()`: a signal, a computed, your own object (B.11). */
export interface ReadableLike<T> {
  get(): T
}

/**
 * A hole: a value that can change. A `Readable`, or a function, which counts
 * as one (C.13). In the browser it's bound to its place in the DOM; on the
 * server it's read once (C.12).
 */
export type Hole<T> = ReadableLike<T> | (() => T)

export function isReadable(value: unknown): value is ReadableLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ReadableLike<unknown>).get === 'function'
  )
}

export function isHole(value: unknown): value is Hole<unknown> {
  return typeof value === 'function' || isReadable(value)
}

/** How to read a hole: its `get`, or the function itself. */
export function readerOf<T>(hole: Hole<T>): () => T {
  return typeof hole === 'function' ? hole : () => hole.get()
}

/** What the server does with a hole: read it, once. Any other value as is. */
export function readOnce(value: unknown): unknown {
  return isHole(value) ? readerOf(value)() : value
}
