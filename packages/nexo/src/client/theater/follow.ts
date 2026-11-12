import { signal } from '../../shared/connector/signal'
import type { ReadonlyView, Readable } from '../../shared/connector/signal'
import { watch } from '../../shared/connector/watch'
import type { AnimateOptions } from '../../shared/theater/options'
import { tween } from './tween'

/**
 * A signal that follows another with a spring or an easing (Svelte's
 * `Tween.of`): it is exactly a signal, a `tween` over it, and a `watch`
 * that calls `.set` — no rule of its own. The one theater piece that
 * imports connector; `animate` and `tween` never do.
 *
 *   const smooth = follow(price, { spring: { duration: 300 }, signal })
 *
 * `signal` is required: the watch on `source` lives until it aborts.
 *   <span>{smooth}</span>
 */
export function follow(
  source: Readable<number>,
  options: AnimateOptions & { readonly signal: AbortSignal },
): ReadonlyView<number> {
  const out = signal(source.get())
  const moving = tween(out, source.get(), options)
  watch(source, (next) => void moving.set(next), { signal: options.signal })
  return out.asReadonly()
}
