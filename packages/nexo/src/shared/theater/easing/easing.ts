/**
 * An easing: progress in time (0 → 1) to progress in value. It may go
 * past 0 or 1 (`back`, `elastic` overshoot). The one shape every curve in
 * theater speaks: a CSS string is read into one of these, and one of
 * these is sampled into CSS `linear()` for the browser.
 *
 *   const half: Easing = (t) => t * t
 *   half(0.5) // 0.25
 */
export type Easing = (progress: number) => number

/** Holds still: the progress in time is the progress in value. */
export const linear: Easing = (t) => t

/** The mirror of an "in" easing: fast first, slow last. */
export function out(easeIn: Easing): Easing {
  return (t) => 1 - easeIn(1 - t)
}

/** An "in" easing for the first half and its mirror for the second. */
export function inOut(easeIn: Easing): Easing {
  return (t) => (t < 0.5 ? easeIn(2 * t) / 2 : 1 - easeIn(2 - 2 * t) / 2)
}
