import { report, type Dispose } from './effect'
import { label, type Named } from './source'
import { watch, type WatchOptions, type WatchSource } from './watch'

export interface EventOptions extends Named {
  /** Where a listener's error goes. By default it's reported, and the rest run. */
  onError?: (error: unknown) => void
}

/** `addEventListener`'s own options. */
export interface ListenOptions {
  /** Aborting it removes the listener. */
  signal?: AbortSignal
  /** Removed after its first call. */
  once?: boolean
}

type Listener<T> = (value: T) => unknown

/** `emit()` with nothing for an `event<void>()`, `emit(value)` otherwise. */
type Payload<T> = [T] extends [void] ? [value?: T] : [value: T]

/**
 * Something that happens, as a signal is something that is (B.4, R.9). One
 * object per event; a group of them is a plain object.
 */
export class TypedEvent<T> {
  readonly name?: string
  readonly label: string
  private readonly listeners = new Set<Listener<T>>()
  private readonly onError: (error: unknown) => void

  constructor(options: EventOptions = {}) {
    this.name = options.name
    this.label = label('event', options.name)
    this.onError = options.onError ?? report
  }

  /** How many listen. */
  get size(): number {
    return this.listeners.size
  }

  /** Listen; the returned function stops it. */
  on(fn: Listener<T>, options: ListenOptions = {}): Dispose {
    const { signal } = options
    if (signal?.aborted) return () => {}
    const off = () => {
      this.listeners.delete(listener)
      signal?.removeEventListener('abort', off)
    }
    const listener = options.once ? this.onceOf(fn, off) : fn
    this.listeners.add(listener)
    signal?.addEventListener('abort', off, { once: true })
    return off
  }

  /** A plain function, so it can be passed as is: `onsave={saved.emit}`. */
  readonly emit = (...[value]: Payload<T>): void => {
    for (const listener of [...this.listeners]) this.call(listener, value as T)
  }

  /** The next value, as a promise; aborting the signal rejects it. */
  next(options: { signal?: AbortSignal } = {}): Promise<T> {
    const { signal } = options
    if (signal?.aborted) return Promise.reject(signal.reason)
    return new Promise((resolve, reject) => {
      const abort = () => reject(signal!.reason)
      signal?.addEventListener('abort', abort, { once: true })
      const settle = (v: T) => (unlisten(signal, abort), resolve(v))
      this.on(settle, { once: true, signal })
    })
  }

  /** Stop every listener. */
  clear(): void {
    this.listeners.clear()
  }

  /** Fires once, then is gone (its abort listener with it). */
  private onceOf(fn: Listener<T>, off: () => void): Listener<T> {
    return (value: T) => (off(), fn(value))
  }

  private call(listener: Listener<T>, value: T): void {
    try {
      listener(value)
    } catch (error) {
      this.reportError(error)
    }
  }

  private reportError(error: unknown): void {
    try {
      this.onError(error)
    } catch (second) {
      report(second)
    }
  }
}

/**
 * Something that happens:
 *
 *   const saved = event<Book>()
 *   saved.on((book) => toast(book.title), { signal })
 *   saved.emit(book)
 */
export function event<T = void>(options?: EventOptions): TypedEvent<T> {
  return new TypedEvent<T>(options)
}

/**
 * The bridge from state to events (B.4): `target` emits the source's new value
 * each time it changes. Exactly `watch(source, now => target.emit(now))`.
 *
 *   changed(settings.theme, themeChanged)
 */
export function changed<T>(
  source: WatchSource<T>,
  target: TypedEvent<T>,
  options?: WatchOptions,
): Dispose {
  return watch(source, (now) => target.emit(...([now] as Payload<T>)), options)
}

function unlisten(signal: AbortSignal | undefined, fn: () => void): void {
  signal?.removeEventListener('abort', fn)
}
