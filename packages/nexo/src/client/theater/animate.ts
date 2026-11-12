import { delayOf, type AnimateOptions } from '../../shared/theater/options'
import { animateElement } from './element'
import { AnimationGroup } from './group'
import type { Keyframes } from './keyframes'
import { writerOf, type Playback, type ValueTarget } from './playback'
import {
  animateSequence,
  isSequence,
  type Sequence,
  type SequenceItem,
  type SequenceOptions,
} from './sequence'
import { speedOf } from './speed'
import { listOf, type Targets } from './targets'
import {
  isValueCall,
  startValue,
  valueTrack,
  type ValueAnimation,
} from './value'

export type { AnimateOptions } from '../../shared/theater/options'
export type { Keyframes } from './keyframes'
export type {
  Segment,
  SegmentOptions,
  SequenceItem,
  SequenceOptions,
} from './sequence'

export type { Targets } from './targets'

/**
 * A journey from A to B, on the clock its target asks for:
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
  sequence: SequenceItem[],
  options?: SequenceOptions,
): Sequence
export function animate(
  first: Targets | number[] | SequenceItem[],
  second?: Keyframes | ValueTarget<number> | SequenceOptions,
  options: AnimateOptions = {},
): Playback {
  if (isValueCall(first, second)) {
    return animateValue(first, second as ValueTarget<number>, options)
  }
  if (isSequence(first))
    return animateSequence(first, second as SequenceOptions)
  return animateElements(first as Targets, second as Keyframes, options)
}

function animateElements(
  targets: Targets,
  keyframes: Keyframes,
  options: AnimateOptions,
): Playback {
  if (targets instanceof Element) {
    return animateElement(targets, keyframes, options)
  }
  const list = listOf(targets)
  const delay = (i: number) => delayOf(options, i, list.length)
  const each = (el: Element, i: number) =>
    animateElement(el, keyframes, { ...options, delay: delay(i) })
  return new AnimationGroup(list.map(each))
}

/** A value on theater's frame loop. Reduced motion leaves it alone unless `reduce: 'jump'`. */
function animateValue(
  keyframes: number[],
  target: ValueTarget<number>,
  options: AnimateOptions,
): ValueAnimation {
  const speed = speedOf(document.documentElement)
  const track = valueTrack(keyframes, options, speed)
  return startValue(track, writerOf(target), options, speed)
}
