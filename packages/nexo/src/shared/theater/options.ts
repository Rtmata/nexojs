import { atSpeed, EasedCurve, type Curve } from './curve'
import { fromCss } from './easing/css'
import type { Easing } from './easing/easing'
import type { InertiaOptions } from './inertia'
import type { Reduce } from './reduce'
import { SpringCurve, type SpringOptions } from './spring'

/** How an animation runs (B.1–B.5): WAAPI's timing, plus theater's own. */
export interface AnimateOptions {
  /** In ms, before speed (C.1b). 300 by default (Motion's). */
  duration?: number
  /** In ms, before speed. In a sequence: a shift from its place (B.2b). */
  delay?: number
  /** A CSS easing or a function (B.4). `ease` by default (CSS's). */
  easing?: string | Easing
  /** A spring instead of an easing (B.3): its duration is computed. */
  spring?: SpringOptions
  /** A fling (B.3b): values only for now; elements get it with `drag`. */
  inertia?: InertiaOptions
  /** How many times; `Infinity` loops. 1 by default. */
  iterations?: number
  /** WAAPI's: `normal`, `reverse`, `alternate`, `alternate-reverse`. */
  direction?: PlaybackDirection
  /** Reduced motion (C.1): `false` essential, `'jump'` all jumps. */
  reduce?: Reduce
  /** Aborting stops it where it is (B.5, B.5b). */
  signal?: AbortSignal
}

export const DEFAULT_DURATION = 300
export const DEFAULT_EASING = 'ease'

/**
 * The curve an animation follows, from its options: a spring when one is
 * given, else the easing over the duration. `speed` divides time (C.1b).
 */
export function curveOf(options: AnimateOptions, speed: number): Curve {
  if (options.spring && options.easing !== undefined) {
    throw new TypeError('theater: give either easing or spring, not both')
  }
  if (options.spring) return atSpeed(new SpringCurve(options.spring), speed)
  const duration = (options.duration ?? DEFAULT_DURATION) / speed
  return new EasedCurve(easingOf(options.easing ?? DEFAULT_EASING), duration)
}

/** A CSS string read into a function; a function as it is. */
export function easingOf(easing: string | Easing): Easing {
  return typeof easing === 'string' ? fromCss(easing) : easing
}
