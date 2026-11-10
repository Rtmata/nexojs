import { toCss } from '../../shared/theater/easing/to-css'
import {
  curveOf,
  DEFAULT_DURATION,
  DEFAULT_EASING,
  delayOf,
  type AnimateOptions,
} from '../../shared/theater/options'
import { applyJumps, splitForReduce, type Keyframes } from './keyframes'
import { reducedMotion } from './reduce'
import { speedOf } from './speed'

/**
 * WAAPI timing from theater's options (A.2, B.3, B.4, C.1b): time divided
 * by the element's speed; a CSS easing passed as it is (the browser reads
 * it exactly); a function or a spring sampled into `linear()`.
 */
function timingOf(
  options: AnimateOptions,
  speed: number,
): KeyframeAnimationOptions {
  const base = {
    delay: delayOf(options) / speed,
    iterations: options.iterations ?? 1,
    direction: options.direction ?? 'normal',
    fill: 'forwards' as const,
  }
  return { ...base, ...curveTiming(options, speed) }
}

function curveTiming(
  options: AnimateOptions,
  speed: number,
): KeyframeAnimationOptions {
  const duration = (options.duration ?? DEFAULT_DURATION) / speed
  const easing = options.easing ?? DEFAULT_EASING
  if (!options.spring && typeof easing === 'string') return { duration, easing }
  const curve = curveOf(options, speed)
  return { duration: curve.duration, easing: curve.toCss() }
}

/**
 * "What you see stays" (B.5b): at its end the animation's values are
 * written inline and it is retired, so nothing jumps back and nothing
 * piles up. Aborting the signal does the same where it is. An explicit
 * `cancel()` is WAAPI's: back to the start.
 */
function keepWhatIsSeen(animation: Animation, signal?: AbortSignal): void {
  const retire = () => settle(animation)
  animation.finished.then(retire, () => {})
  if (signal?.aborted) retire()
  signal?.addEventListener('abort', retire, { once: true })
}

export function settle(animation: Animation): void {
  if (animation.playState === 'idle') return
  const pseudo = (animation.effect as KeyframeEffect | null)?.pseudoElement
  if (pseudo) return // a pseudo-element has no style attribute: it keeps its fill
  commitIfRendered(animation)
  animation.cancel()
}

/** An element no longer rendered (an exit just removed it) has nothing to keep. */
function commitIfRendered(animation: Animation): void {
  try {
    animation.commitStyles()
  } catch (error) {
    if ((error as DOMException).name !== 'NoModificationAllowedError')
      throw error
  }
}

/**
 * Where a sequence puts an element's animation (B.2): when it starts and
 * how long it holds after it ends, both in ms after speed, so every part
 * of the sequence ends together. The sequence, not the part, settles it.
 */
export interface Place {
  delay: number
  endDelay: number
  /** The sequence's speed: all its parts keep one time (C.1b). */
  speed: number
}

/**
 * One element's animation on WAAPI (A.2): the browser runs it (transform
 * and opacity off the main thread) and `getAnimations()` sees it, so
 * omino's exits wait for it. Reduced motion is applied when it starts
 * (C.1).
 */
export function animateElement(
  el: Element,
  keyframes: Keyframes,
  options: AnimateOptions,
  place?: Place,
): Animation {
  const reduced = reducedMotion()
  const split = splitForReduce(keyframes, options.reduce, reduced)
  applyJumps(el, split.jumps)
  const animation = el.animate(
    split.keyframes,
    timingFor(el, options, reduced, place),
  )
  if (!place) keepWhatIsSeen(animation, options.signal)
  return animation
}

/** All jumps under `reduce: 'jump'`; else the options' timing, placed if in a sequence. */
function timingFor(
  el: Element,
  options: AnimateOptions,
  reduced: boolean,
  place?: Place,
): KeyframeAnimationOptions {
  if (reduced && options.reduce === 'jump') return { duration: 0 }
  return placed(timingOf(options, place?.speed ?? speedOf(el)), place)
}

/** In a sequence, a part waits in its first state and holds its last. */
function placed(
  timing: KeyframeAnimationOptions,
  place?: Place,
): KeyframeAnimationOptions {
  if (!place) return timing
  const { delay, endDelay } = place
  return { ...timing, delay, endDelay, fill: 'both' }
}
