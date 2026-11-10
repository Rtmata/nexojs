import { inOut, out, type Easing } from './easing'

/**
 * Cubic: t³. Robert Penner's curve, the same values as Svelte's
 * `svelte/easing` (each of In / Out / InOut).
 *
 *   animate(cover, keyframes, { easing: cubicOut })
 */
export const cubicIn: Easing = (t) => t * t * t
export const cubicOut: Easing = out(cubicIn)
export const cubicInOut: Easing = inOut(cubicIn)
