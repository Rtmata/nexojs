import type { Easing } from './easing'

/** Where the jumps go, as CSS `steps()` names them. */
export type StepPosition =
  'jump-start' | 'jump-end' | 'jump-none' | 'jump-both' | 'start' | 'end'

/** How many jumps each position makes for `count` steps. */
const JUMPS: Record<StepPosition, (count: number) => number> = {
  'jump-start': (n) => n,
  start: (n) => n,
  'jump-end': (n) => n,
  end: (n) => n,
  'jump-none': (n) => n - 1,
  'jump-both': (n) => n + 1,
}

/**
 * CSS `steps(count, position)` as an easing: the value holds, then jumps
 * (CSS Easing Functions Level 2, "step easing functions"). The browser's
 * "before flag" for `jump-start` inside a delay is not modelled: theater
 * applies delays itself.
 *
 *   const tick = steps(4, 'jump-end')
 *   tick(0.3) // 0.25
 */
export function steps(count: number, position: StepPosition = 'end'): Easing {
  checkCount(count, position)
  const jumps = JUMPS[position](count)
  const startsUp = position === 'jump-start' || position === 'start'
  const first = startsUp || position === 'jump-both' ? 1 : 0
  return (t) => clampStep(Math.floor(t * count) + first, t, jumps) / jumps
}

/** Before 0 or after 1 the step isn't clamped; inside, it stays in range. */
function clampStep(step: number, t: number, jumps: number): number {
  if (t >= 0 && step < 0) return 0
  if (t <= 1 && step > jumps) return jumps
  return step
}

function checkCount(count: number, position: StepPosition): void {
  const least = position === 'jump-none' ? 2 : 1
  if (Number.isInteger(count) && count >= least) return
  throw new RangeError(
    `theater: steps(${count}, ${position}) needs a whole number of steps, at least ${least}`,
  )
}
