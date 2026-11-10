import { inOut, out, type Easing } from './easing'

/**
 * Quartic: t⁴. Robert Penner's curve, the same values as Svelte's
 * `svelte/easing` (each of In / Out / InOut).
 *
 *   animate(cover, keyframes, { easing: quartOut })
 */
export const quartIn: Easing = (t) => t ** 4
export const quartOut: Easing = out(quartIn)
export const quartInOut: Easing = inOut(quartIn)
