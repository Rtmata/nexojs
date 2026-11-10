import { inOut, out, type Easing } from './easing'

/**
 * Quadratic: t². Robert Penner's curve, the same values as Svelte's
 * `svelte/easing` (each of In / Out / InOut).
 *
 *   animate(cover, keyframes, { easing: quadOut })
 */
export const quadIn: Easing = (t) => t * t
export const quadOut: Easing = out(quadIn)
export const quadInOut: Easing = inOut(quadIn)
