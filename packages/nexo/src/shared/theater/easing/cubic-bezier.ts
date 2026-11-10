import type { Easing } from './easing'

/** Close enough: a thousandth of a pixel on a 1000 px move. */
const PRECISION = 1e-6
const NEWTON_STEPS = 8
const BISECTION_STEPS = 30

/**
 * One axis of a cubic Bézier from (0, 0) to (1, 1) with control points
 * `a` and `b` on that axis, in polynomial form: ((A·t + B)·t + C)·t.
 */
class BezierAxis {
  private readonly c: number
  private readonly b: number
  private readonly a: number

  constructor(p1: number, p2: number) {
    this.c = 3 * p1
    this.b = 3 * (p2 - p1) - this.c
    this.a = 1 - this.c - this.b
  }

  at(t: number): number {
    return ((this.a * t + this.b) * t + this.c) * t
  }

  slopeAt(t: number): number {
    return (3 * this.a * t + 2 * this.b) * t + this.c
  }
}

/**
 * CSS `cubic-bezier(x1, y1, x2, y2)` as an easing (pattern: the solver
 * browsers use, as WebKit's UnitBezier): find the curve's `t` whose x is
 * the time — Newton's method first, halving the interval if it stalls —
 * then read its y.
 *
 *   const ease = cubicBezier(0.25, 0.1, 0.25, 1) // CSS `ease`
 *   ease(0.5) // ≈ 0.8024
 */
export function cubicBezier(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): Easing {
  checkX(x1, x2)
  const x = new BezierAxis(x1, x2)
  const y = new BezierAxis(y1, y2)
  return (time) => y.at(solve(x, time))
}

/** CSS refuses x outside [0, 1]: the curve would go back in time. */
function checkX(x1: number, x2: number): void {
  if (x1 >= 0 && x1 <= 1 && x2 >= 0 && x2 <= 1) return
  throw new RangeError(
    `theater: cubic-bezier x values must be between 0 and 1, got ${x1} and ${x2}`,
  )
}

/** The curve's `t` where x equals `time`. */
function solve(x: BezierAxis, time: number): number {
  const guess = newton(x, time)
  return guess ?? bisect(x, time)
}

function newton(x: BezierAxis, time: number): number | null {
  let t = time
  for (let i = 0; i < NEWTON_STEPS; i++) {
    const error = x.at(t) - time
    if (Math.abs(error) < PRECISION) return t
    const slope = x.slopeAt(t)
    if (Math.abs(slope) < PRECISION) return null
    t -= error / slope
  }
  return null
}

function bisect(x: BezierAxis, time: number): number {
  let [low, high, t] = [0, 1, time]
  for (let i = 0; i < BISECTION_STEPS; i++) {
    const error = x.at(t) - time
    if (Math.abs(error) < PRECISION) break
    if (error > 0) high = t
    else low = t
    t = (low + high) / 2
  }
  return t
}
