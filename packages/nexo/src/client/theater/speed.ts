/**
 * The speed of every animation below an element (C.1b): one inherited CSS
 * custom property is the single source. Site CSS reads it in `calc()`,
 * theater reads it from the element it animates, bridge from `<html>`.
 *
 *   .card { transition: opacity calc(300ms / var(--theater-speed, 1)) }
 */
export const SPEED_PROPERTY = '--theater-speed'

/**
 * Sets the speed below `el`: 2 is twice as fast, 0.5 half (durations are
 * divided by it). Only writes the property; what reads it, reads it.
 *
 *   setSpeed(document.documentElement, 0.5) // the visitor chose "slow"
 */
export function setSpeed(el: HTMLElement, speed: number): void {
  el.style.setProperty(SPEED_PROPERTY, String(checked(speed, String(speed))))
}

/**
 * The speed that reaches `el`: its own or an ancestor's, 1 when nobody
 * set one.
 *
 *   animate(cover, …, { duration: 300 }) // lasts 300 / speedOf(cover)
 */
export function speedOf(el: Element): number {
  const text = getComputedStyle(el).getPropertyValue(SPEED_PROPERTY).trim()
  if (text === '') return 1
  return checked(Number(text), `${SPEED_PROPERTY}: ${text}`)
}

function checked(speed: number, where: string): number {
  if (Number.isFinite(speed) && speed > 0) return speed
  throw new RangeError(
    `theater: a speed is a positive number (1 normal, 2 twice as fast), got ${where}`,
  )
}
