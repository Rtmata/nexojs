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

export function curveTiming(
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
  if (signal?.aborted) return retire()
  // A long-lived signal (a page's, a mount's) must not keep every ended animation alive.
  const listening = new AbortController()
  signal?.addEventListener('abort', retire, {
    once: true,
    signal: listening.signal,
  })
  animation.finished.then(retire, () => {}).finally(() => listening.abort())
}

/**
 * Animations driven by scroll (D.1): reaching their end is not the end of
 * them — scrolling back runs them again — so they are only retired when
 * unlinked (the scroll's signal aborts).
 */
const scrollLinked = new WeakSet<Animation>()

export function linkToScroll(animation: Animation): void {
  scrollLinked.add(animation)
}

/** Unlinks it from the scroll and retires it where it is (B.5b). */
export function unlinkFromScroll(animation: Animation): void {
  scrollLinked.delete(animation)
  settle(animation)
}

export function settle(animation: Animation): void {
  if (scrollLinked.has(animation) || animation.playState === 'idle') return
  const pseudo = (animation.effect as KeyframeEffect | null)?.pseudoElement
  if (pseudo) return // a pseudo-element has no style attribute: it keeps its fill
  try {
    commitIfRendered(animation)
  } finally {
    animation.cancel() // whatever happened, a fill-forwards animation never stays behind
  }
}

/**
 * What `commitStyles` throws where there is nothing to keep: an element no
 * longer rendered (an exit removed it, `display: none` hid it) or one with
 * no style attribute to write to.
 */
const NOTHING_TO_KEEP = new Set([
  'InvalidStateError',
  'NoModificationAllowedError',
])

function commitIfRendered(animation: Animation): void {
  try {
    animation.commitStyles()
  } catch (error) {
    if (!NOTHING_TO_KEEP.has((error as DOMException).name)) throw error
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
