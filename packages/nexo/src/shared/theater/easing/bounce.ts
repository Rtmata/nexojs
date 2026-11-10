import { inOut, type Easing } from './easing'

/**
 * A ball dropped on the floor: four bounces, each lower (out). Robert
 * Penner's curve, the same values as Svelte's `svelte/easing`.
 *
 *   animate(cover, keyframes, { easing: bounceOut })
 */
export const bounceOut: Easing = (t) => {
  if (t < 4 / 11) return 7.5625 * t * t
  if (t < 8 / 11) return 9.075 * t * t - 9.9 * t + 3.4
  if (t < 9 / 10)
    return (4356 / 361) * t * t - (35442 / 1805) * t + 16061 / 1805
  return 10.8 * t * t - 20.52 * t + 10.72
}
export const bounceIn: Easing = (t) => 1 - bounceOut(1 - t)
export const bounceInOut: Easing = inOut(bounceIn)
