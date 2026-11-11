import { inOut, out, type Easing } from './easing'

/** How far back it pulls before going (Penner's 10 % overshoot). */
const PULL = 1.70158
/** The in-out version pulls further, as Penner's equations do. */
const PULL_IN_OUT = PULL * 1.525

/** Pulls back by `pull` first, then goes. */
function backInBy(pull: number): Easing {
  return (t) => t * t * ((pull + 1) * t - pull)
}

/**
 * Pulls back before it goes (in), overshoots before it lands (out). Robert
 * Penner's curve, the same values as Svelte's `svelte/easing`.
 *
 *   animate(cover, keyframes, { easing: backOut })
 */
export const backIn: Easing = backInBy(PULL)
export const backOut: Easing = out(backIn)
export const backInOut: Easing = inOut(backInBy(PULL_IN_OUT))
