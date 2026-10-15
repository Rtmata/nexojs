import { SEGMENT_ATTRIBUTE } from '../../shared/bridge/vocabulary'
import { segmentIn } from './attributes'
import type { Options } from './options'

/** One segment of this page and what the response brought for it. */
export interface Swap {
  name: string
  current: Element
  incoming: Element
  mode: Options['swap']
}

/**
 * Pairs the segments of the current page with the ones a response
 * brought. Targets must be on both sides; twins (`data-bridge-twin`) come
 * along only when the response has them. A segment inside another one
 * being swapped comes with it: its new content is already inside the
 * outer one's, so only the outermost pairs are swapped.
 */
export function pairAll(
  targets: string[],
  page: Document,
  mode: Options['swap'],
): Swap[] {
  const wanted = targets.map((name) => pair(name, page, mode))
  const twins = twinNames().filter((name) => !targets.includes(name))
  const extra = twins
    .map((name) => tryPair(name, page))
    .filter((swap): swap is Swap => swap !== null)
  return outermost([...wanted, ...extra])
}

function outermost(swaps: Swap[]): Swap[] {
  const inside = (swap: Swap) =>
    swaps.some(
      (other) => other !== swap && other.current.contains(swap.current),
    )
  return swaps.filter((swap) => !inside(swap))
}

/** Segments of this page marked as twins: they refresh whenever a response carries them. */
export function twinNames(): string[] {
  const twins = document.querySelectorAll(
    `[${SEGMENT_ATTRIBUTE}][data-bridge-twin]`,
  )
  return [...twins].map((twin) => twin.getAttribute(SEGMENT_ATTRIBUTE)!)
}

function pair(name: string, page: Document, mode: Options['swap']): Swap {
  const current = segmentIn(document, name)
  const incoming = segmentIn(page, name)
  if (!current || !incoming)
    throw new SegmentMissing(name, current ? 'in the response' : 'in this page')
  return { name, current, incoming, mode }
}

function tryPair(name: string, page: Document): Swap | null {
  const current = segmentIn(document, name)
  const incoming = segmentIn(page, name)
  return current && incoming
    ? { name, current, incoming, mode: 'replace' }
    : null
}

export class SegmentMissing extends Error {
  constructor(
    readonly name: string,
    where: string,
  ) {
    super(`bridge: no segment "${name}" ${where}`)
  }
}

/** Puts the new content in: the whole element, or just its children after/before the old ones. */
export function apply(swaps: Swap[]): Element[] {
  return swaps.map(({ current, incoming, mode }) => {
    if (mode === 'replace') return replace(current, incoming)
    const children = [...incoming.childNodes]
    if (mode === 'append') current.append(...children)
    else current.prepend(...children)
    return current
  })
}

function replace(current: Element, incoming: Element): Element {
  current.replaceWith(incoming)
  return incoming
}

/**
 * An error response goes into `name`: its own segment of that name when
 * the response has one, else the response's `<main>` (or body) inside a
 * fresh copy of the current element, so the segment keeps its name.
 */
export function errorSwap(name: string, page: Document): Swap {
  const current = segmentIn(document, name)
  if (!current) throw new SegmentMissing(name, 'in this page')
  const incoming = segmentIn(page, name) ?? wrapped(current, mainOf(page))
  return { name, current, incoming, mode: 'replace' }
}

function mainOf(page: Document): Element {
  return page.querySelector('main') ?? page.body
}

function wrapped(current: Element, content: Element): Element {
  const copy = current.cloneNode(false) as Element
  copy.append(...content.childNodes)
  return copy
}
