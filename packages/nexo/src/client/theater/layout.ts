import type { AnimateOptions } from '../../shared/theater/options'
import { animateElement, endsAtRest } from './element'
import { AnimationGroup } from './group'
import type { Playback } from './playback'

/** Where elements were: the "first" of FLIP (E.1). */
export interface Measured {
  readonly boxes: ReadonlyMap<Element, DOMRect>
}

/**
 * Takes the elements' boxes now, before a change made elsewhere (an omino
 * render, a bridge swap). Pass what it returns to `flip` after the change.
 *
 *   const before = measure(covers)
 *   await swap
 *   flip(before, { spring: { duration: 400 } })
 */
export function measure(elements: Iterable<Element>): Measured {
  const list = [...elements]
  return { boxes: new Map(list.map((el) => [el, el.getBoundingClientRect()])) }
}

/** The offset and scale that put an element's box back where it was. */
function inverseOf(first: DOMRect, last: DOMRect): Keyframe[] | null {
  const dx = first.x + first.width / 2 - (last.x + last.width / 2)
  const dy = first.y + first.height / 2 - (last.y + last.height / 2)
  const sx = last.width ? first.width / last.width : 1
  const sy = last.height ? first.height / last.height : 1
  if (dx === 0 && dy === 0 && sx === 1 && sy === 1) return null
  return [
    { translate: `${dx}px ${dy}px`, scale: `${sx} ${sy}` },
    { translate: '0 0', scale: '1 1' },
  ]
}

/**
 * Module-level on purpose: each element's FLIP in flight. A newer FLIP of
 * the same element replaces it: measured with the old one still running,
 * its "last" box would carry the old offset, and the old one's end would
 * write over the new one's.
 */
const inFlight = new WeakMap<Element, Playback>()

function land(el: Element): void {
  inFlight.get(el)?.cancel()
  inFlight.delete(el)
}

/**
 * Animates the measured elements from where they were to where they are
 * now (the "last, invert, play" of FLIP, E.1), on WAAPI with theater's
 * curve, speed and reduced motion. Elements that didn't move, or left
 * the page, are skipped.
 */
export function flip(before: Measured, options: AnimateOptions = {}): Playback {
  for (const el of before.boxes.keys()) land(el)
  const animations = [...before.boxes].flatMap(([el, first]) => {
    const keyframes = el.isConnected
      ? inverseOf(first, el.getBoundingClientRect())
      : null
    return keyframes ? [flipOne(el, keyframes, options)] : []
  })
  return new AnimationGroup(animations)
}

/**
 * Added on top of what is under it (decided 2026-11-10): a drag's inline
 * `translate` goes on moving during the FLIP, and at the end nothing is
 * written inline (it ends at no offset).
 */
function flipOne(
  el: Element,
  keyframes: Keyframe[],
  options: AnimateOptions,
): Playback {
  const animation = animateElement(el, keyframes, {
    ...options,
    composite: 'add',
  })
  endsAtRest(animation)
  inFlight.set(el, animation)
  return animation
}

/**
 * `measure`, your change, `flip` — in one call (E.1).
 *
 *   layout(covers, () => applyFilter(), { spring: { duration: 400 }, signal })
 */
export function layout(
  elements: Iterable<Element>,
  update: () => void,
  options: AnimateOptions = {},
): Playback {
  const before = measure(elements)
  update()
  return flip(before, options)
}

/** What omino's `<For move={…}>` calls: the rows' elements, and the reorder. */
export type MoveFn = (rows: Element[], update: () => void) => unknown

/**
 * A row mover for omino's `<For move={moves(options)}>` (E.2): FLIP with
 * theater's curve. omino calls it with the rows and the reorder; it never
 * imports theater.
 *
 *   <For each={games} key={(g) => g.id} move={moves({ spring: { duration: 400 } })}>
 */
export function moves(options: AnimateOptions = {}): MoveFn {
  return (rows, update) => layout(rows, update, options)
}
