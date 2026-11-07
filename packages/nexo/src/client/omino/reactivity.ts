/**
 * What the renderer needs from a signals library, as a value (R.12):
 *
 *   import * as connector from '@nexoamigos/nexo/connector'
 *   mount(<App />, document.body, { signal, reactivity: connector })
 *
 * connector meets it as is; another library enters through an adapter. omino
 * never imports one: A.1, every module works alone.
 */
export interface Reactivity {
  signal<T>(value: T): ReactiveValue<T>
  effect(body: EffectBody, options?: EffectOptions): () => void
  untrack<T>(fn: () => T): T
  batch<T>(fn: () => T): T
  /** The default scheduler: holes update on it (R.15). */
  microtask: Scheduler
}

/** A value with `.get()` and `.set()`: a signal. */
export interface ReactiveValue<T> {
  get(): T
  set(value: T): void
  peek(): T
}

export type EffectBody = (run: { signal: AbortSignal }) => unknown

export interface EffectOptions {
  scheduler?: Scheduler
  signal?: AbortSignal
  name?: string
}

/** connector's scheduler shape (B.7): being called is the "dirty" notice. */
export interface Scheduler {
  schedule(run: () => void): () => unknown
  /** Only on those that can block the thread (B.7, R.6). */
  readonly limit?: number
  exhausted?(): boolean
}

export { isHole, isReadable, readerOf } from '../../shared/omino/hole'
export type { Hole, ReadableLike } from '../../shared/omino/hole'
