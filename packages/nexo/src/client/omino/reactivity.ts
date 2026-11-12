/**
 * What the renderer needs from a signals library, as a value:
 *
 *   import * as connector from '@nexoamigos/nexo/connector'
 *   mount(<App />, document.body, { signal, reactivity: connector })
 *
 * connector meets it as is; another library enters through an adapter. omino
 * never imports one: every module works alone. boat's client router declares
 * its own, overlapping on purpose: each asks only for what it uses.
 */
export interface Reactivity {
  signal<T>(value: T): ReactiveValue<T>
  effect(body: EffectBody, options?: EffectOptions): () => void
  untrack<T>(fn: () => T): T
  batch<T>(fn: () => T): T
  /** The default scheduler: holes update on it. */
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

/** connector's scheduler shape: being called is the "dirty" notice. */
export interface Scheduler {
  schedule(run: () => void): () => unknown
  /** Only on those that can block the thread. */
  readonly limit?: number
  exhausted?(): boolean
}

export { isHole, isReadable, readerOf } from '../../shared/omino/hole'
export type { Hole, ReadableLike } from '../../shared/omino/hole'
