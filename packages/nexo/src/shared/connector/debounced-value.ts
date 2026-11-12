import { debounce, type DebounceOptions, type Debounced } from './debounce'
import type { Dispose } from './effect'
import { sync } from './schedulers'
import { signal, type ReadonlyView, type Signal } from './signal'
import { untrack, type Named } from './source'
import { watch, type WatchSource } from './watch'

export interface DebouncedValueOptions extends DebounceOptions, Named {}

/**
 * A value that follows its source once the source stops changing for `ms`.
 * Nothing of its own: a `signal`, written by a `watch` on `sync` (it
 * hears every change, through computeds too) whose callback is `debounce`d.
 */
export class DebouncedValue<T> implements ReadonlyView<T> {
  /** True while a change is waiting to arrive. */
  readonly pending: ReadonlyView<boolean>
  /** Stops following the source; what's waiting is dropped. */
  readonly dispose: Dispose
  private readonly value: Signal<T>
  private readonly write: Debounced<[T]>

  constructor(
    source: WatchSource<T>,
    ms: number,
    options: DebouncedValueOptions,
  ) {
    this.value = signal(
      untrack(() => readNow(source)),
      { name: options.name },
    )
    this.write = debounce((now: T) => this.value.set(now), ms, options)
    this.pending = this.write.pending
    this.dispose = this.follow(source, options)
  }

  get(): T {
    return this.value.get()
  }

  peek(): T {
    return this.value.peek()
  }

  toJSON(): T {
    return this.value.peek()
  }

  /** Skip the wait: the latest value arrives now. */
  flush(): void {
    this.write.flush()
  }

  private follow(
    source: WatchSource<T>,
    options: DebouncedValueOptions,
  ): Dispose {
    const stop = watch(source, (now) => this.write(now), {
      scheduler: sync,
      signal: options.signal,
    })
    return () => (stop(), this.write.cancel())
  }
}

/**
 * The source's value, `ms` after it stops changing:
 *
 *   const query = debouncedValue(search, 300)
 *   effect(() => list(query.get()))
 */
export function debouncedValue<T>(
  source: WatchSource<T>,
  ms: number,
  options: DebouncedValueOptions = {},
): DebouncedValue<T> {
  return new DebouncedValue(source, ms, options)
}

function readNow<T>(source: WatchSource<T>): T {
  return typeof source === 'function' ? source() : source.get()
}
