import { batch } from './batch'
import { KeySignals, Shape } from './key-signals'

/**
 * A `Set` whose reads are tracked (B.9a). `has(x)` for a value in it depends
 * on that value only; for one not in it, on what the set holds. Iterating and
 * `size` depend on what it holds.
 *
 *   const open = new SignalSet<string>()
 *   effect(() => console.log(open.has('menu')))
 *   open.add('menu')
 */
export class SignalSet<T> implements Iterable<T> {
  private readonly items: Set<T>
  private readonly present = new KeySignals<T, boolean>()
  private readonly shape = new Shape()

  constructor(values?: Iterable<T> | null) {
    this.items = new Set(values)
  }

  get [Symbol.toStringTag](): string {
    return 'SignalSet'
  }

  get size(): number {
    return this.read().size
  }

  has(value: T): boolean {
    if (this.items.has(value)) return this.present.read(value, true)
    this.shape.track()
    return false
  }

  add(value: T): this {
    if (this.items.has(value)) return this
    this.items.add(value)
    this.shape.changed()
    return this
  }

  delete(value: T): boolean {
    if (!this.items.delete(value)) return false
    batch(() => {
      this.present.drop(value, false)
      this.shape.changed()
    })
    return true
  }

  clear(): void {
    if (this.items.size === 0) return
    this.items.clear()
    batch(() => {
      this.present.dropAll(false)
      this.shape.changed()
    })
  }

  forEach(fn: (value: T, again: T, set: ReadonlySet<T>) => void): void {
    this.read().forEach(fn)
  }

  values(): SetIterator<T> {
    return this.read().values()
  }

  keys(): SetIterator<T> {
    return this.read().keys()
  }

  entries(): SetIterator<[T, T]> {
    return this.read().entries()
  }

  [Symbol.iterator](): SetIterator<T> {
    return this.values()
  }

  union<U>(other: ReadonlySetLike<U>): Set<T | U> {
    return this.read().union(other)
  }

  intersection<U>(other: ReadonlySetLike<U>): Set<T & U> {
    return this.read().intersection(other)
  }

  difference<U>(other: ReadonlySetLike<U>): Set<T> {
    return this.read().difference(other)
  }

  symmetricDifference<U>(other: ReadonlySetLike<U>): Set<T | U> {
    return this.read().symmetricDifference(other)
  }

  isSubsetOf(other: ReadonlySetLike<unknown>): boolean {
    return this.read().isSubsetOf(other)
  }

  isSupersetOf(other: ReadonlySetLike<unknown>): boolean {
    return this.read().isSupersetOf(other)
  }

  isDisjointFrom(other: ReadonlySetLike<unknown>): boolean {
    return this.read().isDisjointFrom(other)
  }

  /** What JSON can hold: the values, as an array (B.9c). */
  toJSON(): T[] {
    return [...this.items]
  }

  private read(): ReadonlySet<T> & Set<T> {
    this.shape.track()
    return this.items
  }
}
