import type { Easing } from './easing/easing'
import { toCss } from './easing/to-css'

/**
 * An animation's shape over time, the central concept of theater (A.2):
 * progress from 0 (start) to 1 (end), which may overshoot. The target only
 * decides which clock reads it — the browser's (an element, through CSS
 * `linear()`) or theater's frame loop (a value, through `at`).
 */
export interface Curve {
  /** How long it runs, in ms (a spring: until it rests). */
  readonly duration: number
  /** Progress at `ms` after the start; past `duration` it is 1. */
  at(ms: number): number
  /** Progress per second at `ms`, so a new target can keep the motion. */
  velocityAt(ms: number): number
  /** The curve as CSS, for the browser to run on an element. */
  toCss(): string
}

/** Small enough for a derivative, large enough for floating point. */
const STEP_MS = 0.01

/**
 * An easing over a fixed duration (B.4): a CSS string read into a
 * function, or a function.
 *
 *   const curve = new EasedCurve(cubicOut, 400)
 *   curve.at(200) // 0.875
 */
export class EasedCurve implements Curve {
  constructor(
    private readonly easing: Easing,
    readonly duration: number,
  ) {
    checkDuration(duration)
  }

  /** Before the start it is at the start: even a duration of 0 has one. */
  at(ms: number): number {
    if (ms >= this.duration) return 1
    if (ms <= 0) return this.easing(0)
    return this.easing(ms / this.duration)
  }

  velocityAt(ms: number): number {
    const later = this.at(ms + STEP_MS)
    return ((later - this.at(ms)) / STEP_MS) * 1000
  }

  toCss(): string {
    return toCss(this.easing, this.duration)
  }
}

/** Infinity is WAAPI's too: it holds the start forever. NaN fails the test. */
function checkDuration(duration: number): void {
  if (duration >= 0) return
  throw new RangeError(
    `theater: an animation lasts 0 ms or more, got ${duration}`,
  )
}

/**
 * A curve run at `speed` (C.1b): the same shape in `1 / speed` the time.
 * Its CSS is the same: `linear()` is drawn over the progress, not time.
 *
 *   atSpeed(spring, 2).duration // half the spring's
 */
export function atSpeed(curve: Curve, speed: number): Curve {
  if (speed === 1) return curve
  return {
    duration: curve.duration / speed,
    at: (ms) => curve.at(ms * speed),
    velocityAt: (ms) => curve.velocityAt(ms * speed) * speed,
    toCss: () => curve.toCss(),
  }
}
