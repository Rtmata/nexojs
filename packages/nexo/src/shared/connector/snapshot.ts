/** What `JSON.stringify` keeps of a value, as a type. */
export type Snapshot<T> = T extends { toJSON(): infer R }
  ? Snapshot<R>
  : T extends (...args: never[]) => unknown
    ? never
    : T extends readonly unknown[]
      ? { [K in keyof T]: Snapshot<T[K]> }
      : T extends object
        ? { [K in keyof T]: Snapshot<T[K]> }
        : T

/**
 * Exactly what `JSON.stringify(x)` produces, as objects instead of text:
 * the same walk, the same `toJSON`, the same losses. For destinations that
 * skip `toJSON`: `postMessage`, `structuredClone`, IndexedDB.
 *
 *   worker.postMessage(snapshot({ settings, log }))
 */
export function snapshot<T>(value: T): Snapshot<T> {
  const text = JSON.stringify(value)
  return text === undefined ? (undefined as Snapshot<T>) : JSON.parse(text)
}
