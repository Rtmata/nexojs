import { animate } from './animate'
import { reducedMotion } from './reduce'
import { scroll, vertical, type ScrollAxis } from './scroll'

export interface ParallaxOptions {
  /**
   * How much it lags behind the scroll: 0 moves with the page, 0.5 at
   * about half its speed (far away), negative ahead of it (near).
   */
  depth: number
  /** `block` by default. */
  axis?: ScrollAxis
  signal?: AbortSignal
}

/** Half a viewport each way at depth 1. */
const REACH = 50

/**
 * A layer moving at its own speed while its element crosses the viewport
 *. It is exactly `scroll(animate(el, { translate }), { subject: el })`
 * — with that piece's fallback and signal. Under reduced motion there is
 * no parallax at all: the layer stays where the page puts it.
 *
 *   parallax(far, { depth: 0.2, signal })
 */
export function parallax(el: Element, options: ParallaxOptions): void {
  if (reducedMotion()) return
  const reach = options.depth * REACH
  const down = vertical(options.axis)
  const at = (amount: number) => (down ? `0 ${amount}vh` : `${amount}vw 0`)
  const keyframes = { translate: [at(-reach), at(reach)] }
  const timing = { duration: 1000, easing: 'linear', reduce: false } as const
  const { axis, signal } = options
  scroll(animate(el, keyframes, timing), { subject: el, axis, signal })
}
