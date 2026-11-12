import type { AnimateOptions } from '../../shared/theater/options'
import { animate } from './animate'
import type { Playback } from './playback'
import { Direction, pageScroller, vertical, type ScrollAxis } from './scroll'

export interface ScrollToOptions extends AnimateOptions {
  /** The scroller. The page's by default. */
  container?: Element
  /** `block` (vertical) by default. */
  axis?: ScrollAxis
  /** Px left before the target (a sticky header's height). */
  offset?: number
}

/**
 * Scrolls to an element or a position with theater's curve: a
 * value on the frame loop, stopped by its signal. Under
 * reduced motion it jumps there at once (`reduce: 'jump'`: it moves the
 * whole page). Note that importing it shadows `window.scrollTo` in your
 * file.
 *
 *   scrollTo(nesRoom, { spring: { duration: 600 }, offset: 64, signal })
 */
export function scrollTo(
  target: Element | number,
  options: ScrollToOptions = {},
): Playback {
  const container = options.container ?? pageScroller()
  const down = vertical(options.axis)
  const direction = new Direction(down)
  const from = direction.scrolled(container)
  const at =
    typeof target === 'number' ? target : direction.startIn(target, container)
  const to = at - (options.offset ?? 0)
  const write = (v: number) => container.scrollTo(instantlyTo(v, down))
  return animate([from, to], write, { ...options, reduce: 'jump' })
}

/** `instant`: under `scroll-behavior: smooth` each frame's write would start the browser's own glide. */
function instantlyTo(
  position: number,
  down: boolean,
): { top?: number; left?: number; behavior: ScrollBehavior } {
  const at = down ? { top: position } : { left: position }
  return { ...at, behavior: 'instant' }
}
