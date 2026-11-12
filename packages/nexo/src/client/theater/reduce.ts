/** The visitor's motion preference, as the browser states it. */
const QUERY = '(prefers-reduced-motion: reduce)'

/**
 * Whether the visitor asked for less motion, read now (it can change while
 * the page is open). WAAPI animations and theater's own ignore CSS
 * `@media`, so theater asks when each animation starts.
 *
 *   if (reducedMotion()) …
 */
export function reducedMotion(): boolean {
  return matchMedia(QUERY).matches
}
