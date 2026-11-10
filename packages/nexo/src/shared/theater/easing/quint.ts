import { inOut, out, type Easing } from './easing'

/**
 * Quintic: t⁵. Robert Penner's curve, the same values as Svelte's
 * `svelte/easing` (each of In / Out / InOut).
 *
 *   animate(cover, keyframes, { easing: quintOut })
 */
export const quintIn: Easing = (t) => t ** 5
export const quintOut: Easing = out(quintIn)
export const quintInOut: Easing = inOut(quintIn)
