import { batch } from './batch'
import { KeySignals, Shape } from './key-signals'

/**
 * A `Map` whose reads are tracked (B.9a). `get(k)` depends on that key's value;
 * `has(k)` on whether that key is in it; for a key not in it, both depend on
 * what the map holds. `keys()` and `size` depend on which keys there are;
 * `values()`, `entries()` and iterating also on every value.
 *
 *   const scores = new SignalMap<string, number>()
 *   effect(() => console.log(scores.get('ada')))
 *   scores.set('ada', 10)
 */
export class SignalMap<K, V> implements Iterable<[K, V]> {
  private readonly items: Map<K, V>
  private readonly cells = new KeySignals<K, V | undefined>()
  private readonly present = new KeySignals<K, boolean>()
  private readonly shape = new Shape()

  constructor(entries?: Iterable<readonly [K, V]> | null) {
    this.items = new Map(entries)
  }

  get [Symbol.toStringTag](): string {
    return 'SignalMap'
  }

  get size(): number {
    return this.readKeys().size
  }

  get(key: K): V | undefined {
    if (this.items.has(key)) return this.cells.read(key, this.items.get(key))
    this.shape.track()
    return undefined
  }

  has(key: K): boolean {
    if (this.items.has(key)) return this.present.read(key, true)
    this.shape.track()
    return false
  }

  set(key: K, value: V): this {
    const isNew = !this.items.has(key)
    this.items.set(key, value)
    batch(() => {
      this.cells.write(key, value)
      if (isNew) this.shape.changed()
    })
    return this
  }

  delete(key: K): boolean {
    if (!this.items.delete(key)) return false
    batch(() => {
      this.cells.drop(key, undefined)
      this.present.drop(key, false)
      this.shape.changed()
    })
    return true
  }

  clear(): void {
    if (this.items.size === 0) return
    this.items.clear()
    batch(() => {
      this.cells.dropAll(undefined)
      this.present.dropAll(false)
      this.shape.changed()
    })
  }

  forEach(fn: (value: V, key: K, map: ReadonlyMap<K, V>) => void): void {
    this.readAll().forEach(fn)
  }

  keys(): MapIterator<K> {
    return this.readKeys().keys()
  }

  values(): MapIterator<V> {
    return this.readAll().values()
  }

  entries(): MapIterator<[K, V]> {
    return this.readAll().entries()
  }

  [Symbol.iterator](): MapIterator<[K, V]> {
    return this.entries()
  }

  /** What JSON can hold: the entries, as `[key, value]` pairs (B.9c). */
  toJSON(): [K, V][] {
    return [...this.items]
  }

  private readKeys(): Map<K, V> {
    this.shape.track()
    return this.items
  }

  /** Which keys there are, and every value. */
  private readAll(): Map<K, V> {
    for (const [key, value] of this.readKeys()) this.cells.read(key, value)
    return this.items
  }
}
