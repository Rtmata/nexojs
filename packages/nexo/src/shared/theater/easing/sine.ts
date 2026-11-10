import { inOut, out, type Easing } from './easing'

/**
 * A quarter of a sine wave. Robert Penner's curve, the same values as Svelte's
 * `svelte/easing` (each of In / Out / InOut).
 *
 *   animate(cover, keyframes, { easing: sineOut })
 */
export const sineIn: Easing = (t) => 1 - Math.cos((t * Math.PI) / 2)
export const sineOut: Easing = out(sineIn)
export const sineInOut: Easing = inOut(sineIn)
