import { batch } from './batch'
import { KeySignals } from './key-signals'
import { signal } from './signal'

/**
 * The reading methods of an array, taken as they are: each one reads the whole
 * array (its length and every item), then runs the native method on it.
 */
const READS = [
  'concat',
  'entries',
  'every',
  'filter',
  'find',
  'findIndex',
  'findLast',
  'findLastIndex',
  'flat',
  'flatMap',
  'forEach',
  'includes',
  'indexOf',
  'join',
  'keys',
  'lastIndexOf',
  'map',
  'reduce',
  'reduceRight',
  'slice',
  'some',
  'toLocaleString',
  'toReversed',
  'toSorted',
  'toSpliced',
  'toString',
  'values',
  'with',
] as const

type Reads = (typeof READS)[number]

/** The types of those methods are the native ones. */
export interface SignalArray<T> extends Pick<ReadonlyArray<T>, Reads> {}

/**
 * An array whose reads are tracked, built of plain signals: one per
 * index someone read, plus `length`. Every change is the native one on the
 * items, then each index read so far gets its value again, and `length` its
 * own; only the ones that differ notify.
 *
 *   const log = new SignalArray<string>()
 *   effect(() => console.log(log.at(-1)))
 *   log.push('saved')
 *   log.set(0, 'edited')   // to change an item, replace it
 */
export class SignalArray<T> implements Iterable<T> {
  private readonly items: T[]
  private readonly cells = new KeySignals<number, T | undefined>()
  private readonly size: ReturnType<typeof signal<number>>

  constructor(items?: Iterable<T> | null) {
    this.items = [...(items ?? [])]
    this.size = signal(this.items.length)
  }

  get [Symbol.toStringTag](): string {
    return 'SignalArray'
  }

  get length(): number {
    return this.size.get()
  }

  /** As `Array#at`: negative counts from the end. */
  at(index: number): T | undefined {
    if (index < 0) return this.fromEnd(index)
    if (index >= this.items.length) return this.outside()
    return this.cells.read(index, this.items[index])
  }

  [Symbol.iterator](): ArrayIterator<T> {
    return this.read().values()
  }

  set(index: number, value: T): void {
    this.change(() => (this.items[index] = value))
  }

  push(...values: T[]): number {
    return this.change(() => this.items.push(...values))
  }

  pop(): T | undefined {
    return this.change(() => this.items.pop())
  }

  shift(): T | undefined {
    return this.change(() => this.items.shift())
  }

  unshift(...values: T[]): number {
    return this.change(() => this.items.unshift(...values))
  }

  splice(start: number, count?: number, ...values: T[]): T[] {
    if (count === undefined) return this.change(() => this.items.splice(start))
    return this.change(() => this.items.splice(start, count, ...values))
  }

  sort(compare?: (a: T, b: T) => number): this {
    this.change(() => this.items.sort(compare))
    return this
  }

  reverse(): this {
    this.change(() => this.items.reverse())
    return this
  }

  fill(value: T, start?: number, end?: number): this {
    this.change(() => this.items.fill(value, start, end))
    return this
  }

  copyWithin(target: number, start: number, end?: number): this {
    this.change(() => this.items.copyWithin(target, start, end))
    return this
  }

  /** What JSON can hold: a plain array. */
  toJSON(): T[] {
    return [...this.items]
  }

  /** The length and every item. */
  private read(): readonly T[] {
    const length = this.size.get()
    for (let i = 0; i < length; i++) this.cells.read(i, this.items[i])
    return this.items
  }

  /** Counting from the end depends on the length too. */
  private fromEnd(index: number): T | undefined {
    const at = this.size.get() + index
    return at < 0 ? undefined : this.cells.read(at, this.items[at])
  }

  private outside(): undefined {
    this.size.get()
    return undefined
  }

  private change<R>(native: () => R): R {
    const result = native()
    batch(() => {
      this.cells.writeAll((index) => this.items[index])
      this.size.set(this.items.length)
    })
    return result
  }
}

for (const name of READS) {
  Object.defineProperty(SignalArray.prototype, name, {
    value(this: SignalArray<unknown>, ...args: unknown[]) {
      const items = (this as unknown as { read(): unknown[] }).read()
      return (items[name] as Function).apply(items, args)
    },
    writable: true,
    configurable: true,
  })
}
