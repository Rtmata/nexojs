import type { AnimateOptions } from '../../shared/theater/options'
import { animate } from './animate'
import type { Playback } from './playback'

export interface ScrollToOptions extends AnimateOptions {
  /** The scroller. The page's by default. */
  container?: Element
  /** `block` (vertical) by default. */
  axis?: 'block' | 'inline' | 'x' | 'y'
  /** Px left before the target (a sticky header's height). */
  offset?: number
}

function vertical(axis: ScrollToOptions['axis'] = 'block'): boolean {
  return axis === 'block' || axis === 'y'
}

/** Where `target` is in the scroller's content, along the axis. */
function positionOf(
  target: Element | number,
  container: Element,
  down: boolean,
): number {
  if (typeof target === 'number') return target
  const box = target.getBoundingClientRect()
  const page = container === document.scrollingElement
  const origin = page
    ? 0
    : down
      ? container.getBoundingClientRect().top
      : container.getBoundingClientRect().left
  const scrolled = down ? container.scrollTop : container.scrollLeft
  return (down ? box.top : box.left) - origin + scrolled
}

/**
 * Scrolls to an element or a position with theater's curve (D.4): a
 * value on the frame loop (B.3 / B.4), stopped by its signal. Under
 * reduced motion it jumps there at once (`reduce: 'jump'`: it moves the
 * whole page). Note that importing it shadows `window.scrollTo` in your
 * file (G.3b).
 *
 *   scrollTo(nesRoom, { spring: { duration: 600 }, offset: 64, signal })
 */
export function scrollTo(
  target: Element | number,
  options: ScrollToOptions = {},
): Playback {
  const container =
    options.container ?? document.scrollingElement ?? document.documentElement
  const down = vertical(options.axis)
  const from = down ? container.scrollTop : container.scrollLeft
  const to = positionOf(target, container, down) - (options.offset ?? 0)
  const write = (v: number) =>
    down ? (container.scrollTop = v) : (container.scrollLeft = v)
  return animate([from, to], write, { ...options, reduce: 'jump' })
}
