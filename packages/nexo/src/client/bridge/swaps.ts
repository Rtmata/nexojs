import {
  COMPONENT_STYLE,
  SEGMENT_ATTRIBUTE,
} from '../../shared/bridge/vocabulary'
import { segmentIn } from './attributes'
import { announce } from './events'
import { lives, PERSIST } from './lives'
import type { Options } from './options'

/** One segment of this page and what the response brought for it. */
export interface Swap {
  name: string
  incoming: Element
  mode: Options['swap']
}

/** A swap with the element it goes into, found as the page is when it is applied. */
interface Placed extends Swap {
  current: Element
}

/**
 * Pairs the segments of the current page with the ones a response
 * brought. Targets must be on both sides; twins (`data-bridge-twin`) come
 * along only when the response has them.
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
  return [...wanted, ...extra]
}

/** Segments of this page marked as twins: they refresh whenever a response carries them. */
export function twinNames(): string[] {
  const twins = document.querySelectorAll(
    `[${SEGMENT_ATTRIBUTE}][data-bridge-twin]`,
  )
  return [...new Set([...twins].map((t) => t.getAttribute(SEGMENT_ATTRIBUTE)!))]
}

function pair(name: string, page: Document, mode: Options['swap']): Swap {
  const current = segmentIn(document, name)
  const incoming = segmentIn(page, name)
  if (!current || !incoming)
    throw new SegmentMissing(name, current ? 'in the response' : 'in this page')
  return { name, incoming, mode }
}

function tryPair(name: string, page: Document): Swap | null {
  const current = segmentIn(document, name)
  const incoming = segmentIn(page, name)
  return current && incoming ? { name, incoming, mode: 'replace' } : null
}

export class SegmentMissing extends Error {
  constructor(
    readonly name: string,
    where: string,
  ) {
    super(`bridge: no segment "${name}" ${where}`)
  }
}

/**
 * Puts the new content in, each swap into the segment as the page has it
 * now (another swap may have replaced it since the response was read).
 * A segment inside another one being swapped comes with it: its new
 * content is already inside the outer one's, so only the outermost go in.
 */
export function apply(swaps: Swap[]): Element[] {
  return outermost(placed(swaps)).map(put)
}

/** One whose segment left the page meanwhile has nowhere to go. */
function placed(swaps: Swap[]): Placed[] {
  return swaps.flatMap((swap) => {
    const current = segmentIn(document, swap.name)
    return current ? [{ ...swap, current }] : []
  })
}

function outermost(swaps: Placed[]): Placed[] {
  const inside = (swap: Placed) =>
    swaps.some(
      (other) =>
        other.current !== swap.current && other.current.contains(swap.current),
    )
  return swaps.filter((swap) => !inside(swap))
}

/** The whole element, or just its children after/before the old ones. */
function put({ current, incoming, mode }: Placed): Element {
  if (mode === 'replace') return replace(current, incoming)
  const children = [...incoming.childNodes]
  if (mode === 'append') current.append(...children)
  else current.prepend(...children)
  return current
}

/** Persisted elements carried over; then the old segment's life ends (C.19b) and it goes. */
function replace(current: Element, incoming: Element): Element {
  carryPersisted(current, incoming)
  lives.end(current)
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
  return { name, incoming, mode: 'replace' }
}

function mainOf(page: Document): Element {
  return page.querySelector('main') ?? page.body
}

/** The segment's identity (its attributes), not its loading state: the flight clears that on the element it marked. The content is copied, the response keeps its own: several targets may take it, and a landing may still need the page whole. */
function wrapped(current: Element, content: Element): Element {
  const copy = current.cloneNode(false) as Element
  copy.removeAttribute('aria-busy')
  copy.append(...content.cloneNode(true).childNodes)
  return copy
}

/** What a swap takes out of the page: replaced segments; appending and prepending take nothing. */
export function leavingOf(swaps: Swap[]): Element[] {
  return outermost(placed(swaps))
    .filter((swap) => swap.mode === 'replace')
    .map((swap) => swap.current)
}

/** At most this long for exits that never finish (C.15c, Angular's 4 s). */
const LEAVE_WAIT = 4000

/**
 * Before they're removed (C.19b): `bridge:leave` on each, and what its
 * listeners hand `detail.waitUntil(promise)` — their exits — is awaited.
 */
export async function leave(elements: Element[]): Promise<void> {
  const waits: Promise<unknown>[] = []
  const waitUntil = (promise: Promise<unknown>) =>
    void waits.push(promise.catch(reportError))
  for (const element of elements)
    announce(element, 'bridge:leave', { waitUntil })
  if (waits.length === 0) return
  const atMost = new Promise((done) => setTimeout(done, LEAVE_WAIT))
  await Promise.race([Promise.all(waits), atMost])
}

/** `data-bridge-persist` (C.19b): the element itself takes its twin's place in what comes in. */
export function carryPersisted(current: Element, incoming: Element): void {
  for (const kept of current.querySelectorAll(`[${PERSIST}][id]`)) {
    const twin = incoming.querySelector(`[id="${CSS.escape(kept.id)}"]`)
    if (twin?.hasAttribute(PERSIST)) twin.replaceWith(kept)
  }
}

/** A segment response brings its components' styles in front: into the head, once (C.20a). */
export function adoptStyles(page: Document): void {
  for (const style of page.querySelectorAll(`style[${COMPONENT_STYLE}]`)) {
    const name = CSS.escape(style.getAttribute(COMPONENT_STYLE)!)
    if (document.head.querySelector(`style[${COMPONENT_STYLE}="${name}"]`))
      continue
    document.head.append(document.adoptNode(style))
  }
}
