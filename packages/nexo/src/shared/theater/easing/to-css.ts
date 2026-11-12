import type { Easing } from './easing'

/** One stop every 10 ms of the animation, as Motion samples (`linear()`). */
const MS_PER_STOP = 10
/** A short animation still gets a recognizable curve. */
const FEWEST_STOPS = 2
/** Four decimals: a ten-thousandth of the distance. */
const DECIMALS = 4

/**
 * An easing function as a CSS `linear()` string, so the browser can run
 * it on an element: sampled every 10 ms of `duration`. A CSS
 * string needs none of this — it goes to the browser as it is.
 *
 *   toCss(elasticOut, 600) // 'linear(0, 0.4239, …, 1)'
 */
export function toCss(easing: Easing, duration: number): string {
  checkDuration(duration)
  const count = Math.max(Math.round(duration / MS_PER_STOP), FEWEST_STOPS)
  const values = Array.from({ length: count + 1 }, (_, i) => easing(i / count))
  return `linear(${values.map(rounded).join(', ')})`
}

/** Without it NaN samples nothing (`linear()`) and Infinity fails to make the array. */
function checkDuration(duration: number): void {
  if (duration >= 0 && Number.isFinite(duration)) return
  throw new RangeError(
    `theater: toCss samples a duration of 0 ms or more (a finite number), got ${duration}`,
  )
}

function rounded(value: number): string {
  return String(Number(value.toFixed(DECIMALS)))
}
