/**
 * The speed of motion below an element (C.1b), read as theater and bridge
 * both read it. Internal: it is not a public path; theater exports the
 * property's name.
 */

/** One inherited CSS custom property is the single source. */
export const SPEED_PROPERTY = '--theater-speed'

/** A speed is a positive, finite number: durations are divided by it. */
export function isSpeed(speed: number): boolean {
  return Number.isFinite(speed) && speed > 0
}

/**
 * The speed that reaches `el`: its own or an ancestor's, 1 when nobody
 * set one. `owner` (`theater`, `bridge`) starts the message of a value
 * that is no speed.
 */
export function speedAt(el: Element, owner: string): number {
  const text = getComputedStyle(el).getPropertyValue(SPEED_PROPERTY).trim()
  if (text === '') return 1
  const speed = Number(text)
  return isSpeed(speed) ? speed : notASpeed(text, owner)
}

/** CSS is markup: reported, and the page keeps moving at 1 (audit item 4). */
function notASpeed(text: string, owner: string): number {
  const message = `${owner}: ${SPEED_PROPERTY}: ${text} is not a speed (a positive number); 1 is used`
  reportError(new RangeError(message))
  return 1
}
