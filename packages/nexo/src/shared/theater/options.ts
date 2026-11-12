import { atSpeed, EasedCurve, type Curve } from './curve'
import { fromCss } from './easing/css'
import type { Easing } from './easing/easing'
import type { InertiaOptions } from './inertia'
import type { Reduce } from './reduce'
import { SpringCurve, type SpringOptions } from './spring'
import type { StaggerDelay } from './stagger'

/** How an animation runs: WAAPI's timing, plus theater's own. */
export interface AnimateOptions {
  /** In ms, before speed. 300 by default (Motion's). */
  duration?: number
  /**
   * In ms, before speed. In a sequence a number shifts the segment from
   * its place. On a list, `stagger(…)` gives each element its own.
   */
  delay?: number | StaggerDelay
  /** A CSS easing or a function. `ease` by default (CSS's). */
  easing?: string | Easing
  /** A spring instead of an easing: its duration is computed. */
  spring?: SpringOptions
  /** A fling: values only for now; elements get it with `drag`. */
  inertia?: InertiaOptions
  /** How many times; `Infinity` loops. 1 by default. */
  iterations?: number
  /** WAAPI's: `normal`, `reverse`, `alternate`, `alternate-reverse`. */
  direction?: PlaybackDirection
  /**
   * WAAPI's: how it combines with what is under it — `'replace'` (the
   * default), `'add'` (on top: FLIP over a drag), `'accumulate'`.
   * Elements only: a value has nothing under it.
   */
  composite?: CompositeOperation
  /** Reduced motion: `false` essential, `'jump'` all jumps. */
  reduce?: Reduce
  /** Aborting stops it where it is. */
  signal?: AbortSignal
}

const DEFAULT_DURATION = 300
export const DEFAULT_EASING = 'ease'

/**
 * The curve an animation follows, from its options: a spring when one is
 * given, else the easing over the duration. `speed` divides time.
 */
export function curveOf(options: AnimateOptions, speed: number): Curve {
  if (options.spring && options.easing !== undefined) {
    throw new TypeError('theater: give either easing or spring, not both')
  }
  if (options.spring) return atSpeed(new SpringCurve(options.spring), speed)
  const duration = durationOf(options) / speed
  return new EasedCurve(easingOf(options.easing ?? DEFAULT_EASING), duration)
}

/**
 * The duration in ms before speed, checked as WAAPI checks it: a negative
 * or NaN one throws a TypeError, as `el.animate` does — on a value it
 * would make an end that never comes.
 */
export function durationOf(options: AnimateOptions): number {
  return nonNegative(options.duration ?? DEFAULT_DURATION, 'duration')
}

/** How many times, checked as WAAPI checks it (`Infinity` loops). */
export function iterationsOf(options: AnimateOptions): number {
  return nonNegative(options.iterations ?? 1, 'iterations')
}

function nonNegative(value: number, name: string): number {
  if (value >= 0) return value // NaN fails it too
  throw new TypeError(
    `theater: ${name} must be a non-negative number, got ${value}`,
  )
}

/** A CSS string read into a function; a function as it is. */
function easingOf(easing: string | Easing): Easing {
  return typeof easing === 'string' ? fromCss(easing) : easing
}

/** The delay of element `index` of `count`, in ms before speed. */
export function delayOf(options: AnimateOptions, index = 0, count = 1): number {
  const given = options.delay ?? 0
  const delay = typeof given === 'function' ? given(index, count) : given
  if (Number.isFinite(delay)) return delay // negative is fine: it starts partway
  throw new TypeError(
    `theater: delay must be a finite number of ms, got ${delay}`,
  )
}
