import { inOut, out, type Easing } from './easing'

/**
 * A spring released from a stretch: swings past both ends. Robert Penner's curve, the same values as Svelte's
 * `svelte/easing` (each of In / Out / InOut).
 *
 *   animate(cover, keyframes, { easing: elasticOut })
 */
export const elasticIn: Easing = (t) =>
  Math.sin((13 * Math.PI * t) / 2) * 2 ** (10 * (t - 1))
export const elasticOut: Easing = out(elasticIn)
export const elasticInOut: Easing = inOut(elasticIn)
