import { batch } from './batch'
import { computed, type Computed } from './computed'
import {
  isOwnCancel,
  report,
  type Dispose,
  type EffectOptions,
  type RunContext,
} from './effect'
import { signal, type ReadonlyView } from './signal'
import { isList, watch, type Values, type WatchSource } from './watch'

/**
 * Where a resource stands. `idle`: a source is `undefined`, nothing loads.
 * `loading`: its sources changed, there's no value yet. `reloading`: `reload()`
 * ran, the last value stays. `ready` / `error`: the load settled. `local`: the
 * value was written by hand, with `set` or `update`.
 */
export type ResourceStatus =
  'idle' | 'loading' | 'reloading' | 'ready' | 'error' | 'local'

/** The loader never sees `undefined` sources: those mean `idle`. */
type Defined<V> = V extends readonly unknown[]
  ? { [K in keyof V]: Exclude<V[K], undefined> }
  : Exclude<V, undefined>

export type Loader<V, T> = (
  now: Defined<V>,
  run: RunContext,
) => PromiseLike<T> | T

/** Exactly `watch`'s options: `scheduler`, `signal`, `onError`, `name`. */
export type ResourceOptions = EffectOptions

/**
 * A `watch` that loads: when its sources change it calls the loader with
 * the run's `signal`, so the latest run wins and a stale answer is dropped.
 * `value` never throws; a failure is in `error` and goes to `onError`.
 */
export class Resource<T> {
  readonly value: ReadonlyView<T | undefined>
  readonly error: ReadonlyView<unknown>
  readonly status: ReadonlyView<ResourceStatus>
  readonly isLoading: Computed<boolean>
  readonly hasValue: Computed<boolean>
  /** Ends it: no more loads, the one in flight is aborted. */
  readonly dispose: Dispose
  private readonly current = signal<T | undefined>(undefined)
  private readonly failure = signal<unknown>(undefined)
  private readonly stage = signal<ResourceStatus>('idle')
  private readonly attempt = signal(0)
  private readonly onError: (error: unknown) => void
  private load?: AbortController

  constructor(
    sources: WatchSource<unknown> | readonly WatchSource<unknown>[],
    private readonly loader: Loader<any, T>,
    options: ResourceOptions = {},
  ) {
    this.value = this.current.asReadonly()
    this.error = this.failure.asReadonly()
    this.status = this.stage.asReadonly()
    this.isLoading = computed(() => isBusy(this.stage.get()))
    this.hasValue = computed(() => this.current.get() !== undefined)
    this.onError = options.onError ?? report
    this.dispose = this.watchSources(sources, options)
  }

  /** Load again with the same sources; the value stays while it does. */
  reload(): void {
    this.attempt.update((n) => n + 1)
  }

  /** A value of your own, as an optimistic update: the load in flight is dropped. */
  set(value: T | undefined): void {
    this.load?.abort()
    this.write(value, undefined, 'local')
  }

  update(fn: (value: T | undefined) => T | undefined): void {
    this.set(fn(this.current.peek()))
  }

  toJSON(): T | undefined {
    return this.current.peek()
  }

  /** Its sources plus `attempt`: a reload is one more source changing. */
  private watchSources(
    sources: WatchSource<unknown> | readonly WatchSource<unknown>[],
    options: ResourceOptions,
  ): Dispose {
    const list = isList(sources) ? sources : [sources]
    const unwrap = isList(sources)
      ? (v: unknown[]) => v
      : (v: unknown[]) => v[0]
    return watch(
      [this.attempt, ...list],
      ([, ...now], before, run) =>
        this.start(now, before?.slice(1), unwrap, run),
      { ...options, immediate: true },
    )
  }

  private start(
    now: unknown[],
    before: unknown[] | undefined,
    unwrap: (values: unknown[]) => unknown,
    run: RunContext,
  ): void {
    if (now.includes(undefined)) return this.idle()
    const load = this.nextLoad(run.signal)
    this.begin(before !== undefined && sameValues(now, before))
    void this.settle(
      () => this.loader(unwrap(now), { signal: load.signal }),
      load,
    )
  }

  private idle(): void {
    this.load?.abort()
    this.write(undefined, undefined, 'idle')
  }

  /** New sources mean the old value would be false data; a reload keeps it. */
  private begin(reloading: boolean): void {
    if (reloading) this.write(this.current.peek(), undefined, 'reloading')
    else this.write(undefined, undefined, 'loading')
  }

  /** Its own controller, aborted by the run's signal or by `set`. */
  private nextLoad(runSignal: AbortSignal): AbortController {
    this.load?.abort()
    const load = new AbortController()
    const abort = () => load.abort(runSignal.reason)
    runSignal.addEventListener('abort', abort, {
      once: true,
      signal: load.signal,
    })
    this.load = load
    return load
  }

  private async settle(
    call: () => PromiseLike<T> | T,
    load: AbortController,
  ): Promise<void> {
    try {
      this.resolve(await call(), load)
    } catch (error) {
      this.reject(error, load)
    }
  }

  private resolve(value: T, load: AbortController): void {
    if (!load.signal.aborted) this.write(value, undefined, 'ready')
  }

  /** A stale load writes nothing, but a real error is still reported. */
  private reject(error: unknown, load: AbortController): void {
    if (isOwnCancel(load.signal, error)) return
    if (!load.signal.aborted) this.write(this.current.peek(), error, 'error')
    this.onError(error)
  }

  private write(
    value: T | undefined,
    error: unknown,
    status: ResourceStatus,
  ): void {
    batch(() => {
      this.current.set(value)
      this.failure.set(error)
      this.stage.set(status)
    })
  }
}

/**
 * Async state from sources:
 *
 *   const book = resource(id, (id, { signal }) =>
 *     fetch(`/books/${id}`, { signal }).then((r) => r.json()))
 *   book.value.get()    // undefined while loading
 *   book.status.get()   // 'loading' → 'ready'
 */
export function resource<T, const S extends readonly WatchSource<unknown>[]>(
  sources: S,
  loader: Loader<Values<S>, T>,
  options?: ResourceOptions,
): Resource<T>
export function resource<T, V>(
  source: WatchSource<V>,
  loader: Loader<V, T>,
  options?: ResourceOptions,
): Resource<T>
export function resource<T>(
  sources: WatchSource<unknown> | readonly WatchSource<unknown>[],
  loader: Loader<any, T>,
  options?: ResourceOptions,
): Resource<T> {
  return new Resource(sources, loader, options)
}

function isBusy(status: ResourceStatus): boolean {
  return status === 'loading' || status === 'reloading'
}

function sameValues(a: unknown[], b: unknown[]): boolean {
  return a.every((value, i) => Object.is(value, b[i]))
}
