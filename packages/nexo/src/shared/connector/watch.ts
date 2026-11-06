import { computed, Computed } from './computed'
import {
  EffectNode,
  nodeOf,
  remember,
  type Dispose,
  type EffectOptions,
  type RunContext,
} from './effect'
import type { Readable } from './signal'
import { Source, untrack } from './source'

/** A function works as a `Readable` whose `get` is that function. */
export type WatchSource<T> = Readable<T> | (() => T)

export interface WatchOptions extends EffectOptions {
  /** Also run for the values it starts with. */
  immediate?: boolean
}

export type Values<S extends readonly WatchSource<unknown>[]> = {
  [K in keyof S]: S[K] extends WatchSource<infer T> ? T : never
}

/**
 * An effect that declares what it depends on: only `sources` are tracked, so
 * nothing the callback reads can wake it. One source or a list.
 *
 *   watch(book, (now, before, { signal }) => load(now, { signal }))
 *   watch([a, () => b.get() * 2], ([x, y]) => draw(x, y))
 */
export function watch<const S extends readonly WatchSource<unknown>[]>(
  sources: S,
  fn: WatchCallback<Values<S>>,
  options?: WatchOptions,
): Dispose
export function watch<T>(
  source: WatchSource<T>,
  fn: WatchCallback<T>,
  options?: WatchOptions,
): Dispose
export function watch(
  sources: WatchSource<unknown> | readonly WatchSource<unknown>[],
  fn: WatchCallback<any>,
  options: WatchOptions = {},
): Dispose {
  const read = reader(sources)
  const body = watchBody(read, fn, options.immediate ?? false)
  const node = new EffectNode(body, options)
  if (options.immediate) node.begin()
  else node.beginNow()
  return remember(node)
}

export type WatchCallback<V> = (
  now: V,
  before: V | undefined,
  run: RunContext,
) => unknown

function watchBody(
  read: () => unknown,
  fn: WatchCallback<unknown>,
  immediate: boolean,
) {
  let before: unknown
  let silent = !immediate
  return (run: RunContext) => {
    const now = read()
    const previous = before
    before = now
    if (silent) silent = false
    else return untrack(() => fn(now, previous, run))
  }
}

function reader(
  sources: WatchSource<unknown> | readonly WatchSource<unknown>[],
): () => unknown {
  if (!isList(sources)) return readerOf(sources)
  const readers = sources.map(readerOf)
  return () => readers.map((read) => read())
}

function readerOf(source: WatchSource<unknown>): () => unknown {
  const readable = typeof source === 'function' ? computed(source) : source
  return () => readable.get()
}

export function isList(
  sources: WatchSource<unknown> | readonly WatchSource<unknown>[],
): sources is readonly WatchSource<unknown>[] {
  return Array.isArray(sources)
}

/**
 * What a computed or an effect depends on right now, for inspecting:
 *
 *   const stop = effect(() => draw(a.get(), b.get()))
 *   sources(stop)   // [a, b]
 */
export function sources(of: Computed<any> | Dispose): Source[] {
  if (of instanceof Computed) return of.sources()
  return nodeOf(of)?.sources() ?? []
}
