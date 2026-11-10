import { InertiaPath } from '../../shared/theater/inertia'
import { curveOf, type AnimateOptions } from '../../shared/theater/options'
import { animateElement } from './element'
import { AnimationGroup } from './group'
import type { Keyframes } from './keyframes'
import { writerOf, type Playback, type ValueTarget } from './playback'
import { reducedMotion } from './reduce'
import { speedOf } from './speed'
import {
  KeyframeTrack,
  ValueAnimation,
  type Track,
  type ValueTiming,
} from './value'

export type { AnimateOptions } from '../../shared/theater/options'
export type { Keyframes } from './keyframes'

/** What `animate` moves: one element, or a list of them. */
export type Targets = Element | Iterable<Element>

/**
 * A journey from A to B (B.1), on the clock its target asks for (A.2):
 * an element (or a list) runs on WAAPI, a value on theater's frame loop.
 * It returns WAAPI's `Animation` shape either way.
 *
 *   animate(cover, { opacity: [0, 1], translate: ['0 24px', '0 0'] }, { spring: { bounce: 0.2 } })
 *   animate([0, 1200], (n) => (count.textContent = String(Math.round(n))), { duration: 800 })
 */
export function animate(
  targets: Targets,
  keyframes: Keyframes,
  options?: AnimateOptions,
): Playback
export function animate(
  keyframes: number[],
  target: ValueTarget<number>,
  options?: AnimateOptions,
): ValueAnimation
export function animate(
  first: Targets | number[],
  second: Keyframes | ValueTarget<number>,
  options: AnimateOptions = {},
): Playback {
  if (isNumbers(first))
    return animateValue(first, second as ValueTarget<number>, options)
  return animateElements(first, second as Keyframes, options)
}

function isNumbers(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'number')
}

function animateElements(
  targets: Targets,
  keyframes: Keyframes,
  options: AnimateOptions,
): Playback {
  if (targets instanceof Element)
    return animateElement(targets, keyframes, options)
  if (typeof targets === 'string' || !(Symbol.iterator in Object(targets))) {
    throw new TypeError(
      'theater: animate takes an element, a list of elements, or numbers and a function (no selector strings: use querySelectorAll)',
    )
  }
  return new AnimationGroup(
    [...targets].map((el) => animateElement(el, keyframes, options)),
  )
}

/** A value on theater's frame loop (A.2). Reduced motion leaves it alone unless `reduce: 'jump'` (C.1). */
function animateValue(
  keyframes: number[],
  target: ValueTarget<number>,
  options: AnimateOptions,
): ValueAnimation {
  const speed = speedOf(document.documentElement)
  const track = trackOf(keyframes, options, speed)
  const write = writerOf(target)
  const timing = valueTiming(options, speed)
  const animation = new ValueAnimation(track, write, timing, options.signal)
  if (reducedMotion() && options.reduce === 'jump') animation.finish()
  else animation.play()
  return animation
}

/** WAAPI's timing for a value, time divided by the page's speed (C.1b). */
function valueTiming(options: AnimateOptions, speed: number): ValueTiming {
  return {
    delay: (options.delay ?? 0) / speed,
    iterations: options.iterations ?? 1,
    direction: options.direction ?? 'normal',
  }
}

function trackOf(
  keyframes: number[],
  options: AnimateOptions,
  speed: number,
): Track {
  if (options.inertia)
    return atSpeedTrack(new InertiaPath(keyframes[0]!, options.inertia), speed)
  if (keyframes.length < 2) {
    throw new RangeError(
      'theater: animating a value needs at least two keyframes (or inertia and a start)',
    )
  }
  return new KeyframeTrack(keyframes, curveOf(options, speed))
}

function atSpeedTrack(track: Track, speed: number): Track {
  if (speed === 1) return track
  return {
    duration: track.duration / speed,
    valueAt: (ms) => track.valueAt(ms * speed),
    velocityAt: (ms) => track.velocityAt(ms * speed) * speed,
  }
}
