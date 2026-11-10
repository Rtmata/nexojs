import { inOut, out, type Easing } from './easing'

/**
 * Exponential: doubles every tenth of the way. Robert Penner's curve, the same values as Svelte's
 * `svelte/easing` (each of In / Out / InOut).
 *
 *   animate(cover, keyframes, { easing: expoOut })
 */
export const expoIn: Easing = (t) => (t === 0 ? 0 : 2 ** (10 * (t - 1)))
export const expoOut: Easing = out(expoIn)
export const expoInOut: Easing = inOut(expoIn)
