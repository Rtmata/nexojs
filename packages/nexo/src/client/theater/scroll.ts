import {
  rangePoint,
  scrollProgress,
  viewProgress,
  type RangePoint,
} from '../../shared/theater/scroll-range'
import { linkToScroll, unlinkFromScroll } from './element'
import { frames } from './frame'
import { AnimationGroup } from './group'
import type { Playback } from './playback'
import { ValueAnimation } from './value'

/** Which way the scroll goes: CSS's logical names, or plain x / y. */
export type ScrollAxis = 'block' | 'inline' | 'x' | 'y'

/**
 * What drives the animation, in the platform's own words: a
 * `ScrollTimeline` of `source`, or — with `subject` — a `ViewTimeline` of
 * that element crossing its scroller.
 */
export interface ScrollOptions {
  /** The scroller. The page's by default; for a view, the subject's nearest. */
  source?: Element
  /** An element whose crossing of the scroller is the timeline. */
  subject?: Element
  /** `block` by default. */
  axis?: ScrollAxis
  /** A view's range: `'entry 0%'`, `'cover 50%'`… `cover 0%` by default. */
  rangeStart?: string
  /** `cover 100%` by default. */
  rangeEnd?: string
  /** Aborting unlinks it; elements stay as they are. */
  signal?: AbortSignal
}

/** `block` and `y` scroll vertically here; writing modes are not read. */
export function vertical(axis: ScrollAxis = 'block'): boolean {
  return axis === 'block' || axis === 'y'
}

/**
 * The nearest scroll container above it, else the page's scroller: the
 * one a `ViewTimeline` picks, so the fallback follows the same box.
 */
function scrollerOf(el: Element): Element {
  for (let at = el.parentElement; at; at = at.parentElement)
    if (isScrollContainer(at)) return at
  return pageScroller()
}

/** The page's scroller: `<html>` where the browser names none. */
export function pageScroller(): Element {
  return document.scrollingElement ?? document.documentElement
}

/** Any overflow but `visible` / `clip` makes one, `hidden` too (CSS Overflow 3). */
function isScrollContainer(el: Element): boolean {
  if (el === document.documentElement || givesOverflowToPage(el)) return false
  const { overflowX, overflowY } = getComputedStyle(el)
  return /(auto|scroll|hidden)/.test(overflowX + overflowY)
}

/** `<body>`'s overflow goes to the page's viewport while `<html>` keeps its own visible. */
function givesOverflowToPage(el: Element): boolean {
  if (el !== document.body) return false
  const { overflowX, overflowY } = getComputedStyle(document.documentElement)
  return overflowX === 'visible' && overflowY === 'visible'
}

/** One scroll direction's measures (pattern: strategy, vertical or horizontal). */
export class Direction {
  constructor(private readonly down: boolean) {}

  scrolled(el: Element): number {
    return this.down ? el.scrollTop : el.scrollLeft
  }

  size(el: Element): number {
    return this.down ? el.scrollHeight : el.scrollWidth
  }

  viewport(el: Element): number {
    return this.down ? el.clientHeight : el.clientWidth
  }

  /** Where a box starts and how long it is, along this direction. */
  span(box: DOMRect): [number, number] {
    return this.down ? [box.top, box.height] : [box.left, box.width]
  }

  /** Where `el` starts in `scroller`'s content; the page's scroller counts from the page's top. */
  startIn(el: Element, scroller: Element): number {
    const [start] = this.span(el.getBoundingClientRect())
    const page = scroller === document.scrollingElement
    const origin = page ? 0 : this.span(scroller.getBoundingClientRect())[0]
    return start - origin + this.scrolled(scroller)
  }
}

/**
 * Reads the scroll's progress from the page's geometry: the fallback where
 * the browser has no scroll timelines, and how values follow it.
 */
class Gauge {
  readonly source: Element
  private readonly direction: Direction
  private readonly from: RangePoint
  private readonly to: RangePoint
  private readonly subject?: Element

  constructor(options: ScrollOptions) {
    const { subject } = options
    this.subject = subject
    this.source =
      options.source ?? (subject ? scrollerOf(subject) : pageScroller())
    this.direction = new Direction(vertical(options.axis))
    this.from = rangePoint(options.rangeStart ?? 'cover 0%')
    this.to = rangePoint(options.rangeEnd ?? 'cover 100%')
  }

  /** 0 to 1: how far through the timeline the scroll is now. */
  progress(): number {
    const { direction, source } = this
    const [scrolled, viewport] = [
      direction.scrolled(source),
      direction.viewport(source),
    ]
    if (!this.subject)
      return scrollProgress(scrolled, direction.size(source), viewport)
    const view = { ...this.subjectOf(this.subject), viewport }
    return viewProgress(scrolled, view, this.from, this.to)
  }

  /** The subject's start in the scroller's content, and its size. */
  private subjectOf(subject: Element) {
    const [, size] = this.direction.span(subject.getBoundingClientRect())
    const start = this.direction.startIn(subject, this.source)
    return { subjectStart: start, subjectSize: size }
  }
}

/** Where the browser can, the timeline is its own (off the main thread). */
function nativeTimeline(options: ScrollOptions): AnimationTimeline | null {
  if (typeof ScrollTimeline === 'undefined') return null
  const axis = options.axis ?? 'block'
  if (options.subject)
    return new ViewTimeline({ subject: options.subject, axis })
  return new ScrollTimeline({
    source: options.source ?? document.scrollingElement,
    axis,
  })
}

/** A range needs `Animation.rangeStart`, which not every browser with timelines has. */
function rangesFit(options: ScrollOptions): boolean {
  const ranged =
    options.rangeStart !== undefined || options.rangeEnd !== undefined
  return !ranged || 'rangeStart' in Animation.prototype
}

/** Hands an element animation to the browser's timeline; false where it can't. */
function linkNative(animation: Animation, options: ScrollOptions): boolean {
  const timeline = rangesFit(options) ? nativeTimeline(options) : null
  if (!timeline) return false
  animation.timeline = timeline
  const ranged = animation as Animation & {
    rangeStart?: string
    rangeEnd?: string
  }
  if (options.rangeStart) ranged.rangeStart = options.rangeStart
  if (options.rangeEnd) ranged.rangeEnd = options.rangeEnd
  return true
}

/** A group's members, or the one animation. */
function membersOf(target: Playback): Playback[] {
  return target instanceof AnimationGroup ? target.members : [target]
}

/** Moves a paused animation to a progress of its whole length. */
function seeker(member: Playback): (progress: number) => void {
  member.pause()
  const end =
    member instanceof ValueAnimation
      ? member.end
      : Number((member as Animation).effect?.getComputedTiming().endTime ?? 0)
  return (progress) => (member.currentTime = progress * end)
}

/** The members the browser can't drive, as functions of progress. */
function seekersOf(
  target: Playback,
  options: ScrollOptions,
): ((p: number) => void)[] {
  const members = membersOf(target)
  for (const member of members)
    if (member instanceof Animation) linkToScroll(member)
  const left = members.filter(
    (m) => !(m instanceof Animation && linkNative(m, options)),
  )
  return left.map(seeker)
}

/** Follows the scroll: reads it in a frame's read phase, writes in render. */
class Follower {
  constructor(
    private readonly seekers: ((p: number) => void)[],
    private readonly gauge: Gauge,
    private readonly signal?: AbortSignal,
  ) {}

  listen(): void {
    const update = () => this.update()
    const page = this.gauge.source === document.scrollingElement
    const listen = { passive: true, signal: this.signal }
    const source = page ? window : this.gauge.source
    source.addEventListener('scroll', update, listen)
    window.addEventListener('resize', update, listen)
    update()
  }

  private update(): void {
    frames().next('read', () => {
      const progress = this.gauge.progress()
      frames().next('render', () => this.seek(progress))
    })
  }

  /** A frame already asked for when the signal aborts must not bring back what was let go. */
  private seek(progress: number): void {
    if (this.signal?.aborted) return
    for (const seek of this.seekers) seek(progress)
  }
}

/** On abort (or already aborted), element members are unlinked and kept where they are. */
function unlinkOnAbort(target: Playback, signal?: AbortSignal): void {
  const members = membersOf(target)
  const unlink = () =>
    members.forEach((m) => m instanceof Animation && unlinkFromScroll(m))
  if (signal?.aborted) return unlink()
  signal?.addEventListener('abort', unlink, { once: true })
}

/**
 * Links an animation (or a function of progress) to a scroll: the
 * scroll position drives its time. Element animations go to the
 * browser's `ScrollTimeline` / `ViewTimeline` where there is one; values,
 * functions and browsers without timelines follow a listener doing the
 * same. For CSS-only pages, use `animation-timeline` inside
 * `@supports (animation-timeline: view())`.
 *
 *   scroll(animate(cover, { rotate: ['-8deg', '8deg'] }), { subject: cover, signal })
 *   scroll((p) => bar.style.setProperty('--read', String(p)), { signal })
 */
export function scroll(
  target: Playback | ((progress: number) => void),
  options: ScrollOptions = {},
): void {
  if (typeof target === 'function') return follow([target], options)
  const seekers = seekersOf(target, options)
  unlinkOnAbort(target, options.signal)
  if (seekers.length > 0) follow(seekers, options)
}

/** The scroll read on the page's frames and handed to `seekers`. */
function follow(
  seekers: ((p: number) => void)[],
  options: ScrollOptions,
): void {
  new Follower(seekers, new Gauge(options), options.signal).listen()
}
