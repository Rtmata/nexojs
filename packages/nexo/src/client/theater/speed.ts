import { isSpeed, SPEED_PROPERTY, speedAt } from '../settle/speed'

/**
 * The speed of every animation below an element: one inherited CSS
 * custom property is the single source. Site CSS reads it in `calc()`,
 * theater reads it from the element it animates, bridge from `<html>`.
 *
 *   .card { transition: opacity calc(300ms / var(--theater-speed, 1)) }
 */
export { SPEED_PROPERTY }

/**
 * Sets the speed below `el`: 2 is twice as fast, 0.5 half (durations are
 * divided by it). Only writes the property; what reads it, reads it.
 *
 *   setSpeed(document.documentElement, 0.5) // the visitor chose "slow"
 */
export function setSpeed(el: HTMLElement, speed: number): void {
  if (!isSpeed(speed)) {
    throw new RangeError(
      `theater: a speed is a positive number (1 normal, 2 twice as fast), got ${speed}`,
    )
  }
  el.style.setProperty(SPEED_PROPERTY, String(speed))
}

/**
 * The speed that reaches `el`: its own or an ancestor's, 1 when nobody
 * set one; a value that is no speed is reported and 1 is used.
 *
 *   animate(cover, …, { duration: 300 }) // lasts 300 / speedOf(cover)
 */
export function speedOf(el: Element): number {
  return speedAt(el, 'theater')
}
