import { batch } from './batch'
import { current, Source, untrack, type Named } from './source'

/** Anything with a `.get()`: a signal, a computed, your own object. */
export interface Readable<T> {
  get(): T
}

/** Anything with `.get()` and `.set()`: what `bind:` accepts. */
export interface Writable<T> extends Readable<T> {
  set(value: T): void
}

export interface SignalOptions<T> extends Named {
  /** When the new value counts as the same one. `Object.is` by default. */
  equals?: (previous: T, next: T) => boolean
}

/** The read half of a node, seen from outside. It's the same node, not a copy. */
export interface ReadonlyView<T> extends Readable<T> {
  peek(): T
  toJSON(): T
}

/**
 * A value that tells who read it when it changes. It notifies if and only if
 * `!equals(old, new)`, so to change an object, replace it.
 */
export class Signal<T> extends Source implements Writable<T> {
  private readonly equals: (previous: T, next: T) => boolean
  private view?: ReadonlyView<T>

  constructor(
    private value: T,
    options: SignalOptions<T> = {},
  ) {
    super('signal', options.name)
    this.equals = options.equals ?? Object.is
  }

  refresh(): void {}

  get(): T {
    this.track()
    return this.value
  }

  /** Exactly `untrack(() => s.get())`. */
  peek(): T {
    return untrack(() => this.get())
  }

  set(next: T): void {
    ensureOutsideComputed(this)
    if (this.equals(this.value, next)) return
    this.value = next
    this.version++
    current.clock++
    batch(() => this.markObservers())
  }

  /** Exactly `set(fn(peek()))`: the read doesn't make an effect depend on it. */
  update(fn: (value: T) => T): void {
    this.set(fn(this.peek()))
  }

  /** Lets `JSON.stringify` and `snapshot` see through it. */
  toJSON(): T {
    return this.peek()
  }

  /** The same node without `set`, for a class to expose. Made once. */
  asReadonly(): ReadonlyView<T> {
    this.view ??= readonlyView(this)
    return this.view
  }
}

/**
 * A value that holds its state:
 *
 *   const count = signal(0)
 *   count.set(1)
 *   count.get()   // 1
 */
export function signal<T>(value: T, options?: SignalOptions<T>): Signal<T> {
  return new Signal(value, options)
}

export function readonlyView<T>(node: ReadonlyView<T>): ReadonlyView<T> {
  return {
    get: () => node.get(),
    peek: () => node.peek(),
    toJSON: () => node.toJSON(),
  }
}

function ensureOutsideComputed(written: Source): void {
  const running = current.observer
  if (!running?.pure) return
  throw new Error(
    `connector: ${written.label} was written while ${running.label} ran. A computed only works out a value: use an effect, or untrack() if the write is on purpose`,
  )
}
