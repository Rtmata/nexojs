import { inOut, out, type Easing } from './easing'

/**
 * A quarter of a circle. Robert Penner's curve, the same values as Svelte's
 * `svelte/easing` (each of In / Out / InOut).
 *
 *   animate(cover, keyframes, { easing: circOut })
 */
export const circIn: Easing = (t) => 1 - Math.sqrt(1 - t * t)
export const circOut: Easing = out(circIn)
export const circInOut: Easing = inOut(circIn)
