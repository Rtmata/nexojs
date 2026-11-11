import { frames } from './frame'
import { reducedMotion } from './reduce'
import { pageScroller } from './scroll'

export interface SmoothWheelOptions {
  /** Turns it off. Required: nothing else ever ends it. */
  signal: AbortSignal
  /** Wheel events over what this says yes to scroll natively (a modal, a map). */
  prevent?: (node: Element) => boolean
  /** How long the glide takes to close most of the gap, in ms. 120 by default. */
  smoothing?: number
}

/** Close enough to stop gliding. */
const REST_PX = 0.5
/** Further from where the glide put it: something else scrolled the page. */
const MOVED_PX = 1

/**
 * The page's wheel, smoothed (D.4, Lenis's model): only the vertical
 * wheel — touch, keys, scrollbars and anchors stay native, and so does
 * the page's own scroll (sticky, find-in-page); when one of them moves
 * the page, the glide lets go and starts again from there. Off unless
 * you turn it on; under reduced motion it does nothing. Sideways wheels
 * (shift too), wheels over a nested scroller, with ctrl (a zoom), over
 * what `prevent` names, or with no room left that way scroll natively.
 *
 *   smoothWheel({ signal, prevent: (node) => node.closest('dialog') !== null })
 */
export function smoothWheel(options: SmoothWheelOptions): void {
  checkSmoothing(options.smoothing)
  if (reducedMotion()) return
  new Glide(options)
}

/** A negative or NaN time would make the glide run away from its target. */
function checkSmoothing(smoothing?: number): void {
  if (smoothing === undefined || (Number.isFinite(smoothing) && smoothing >= 0))
    return
  throw new RangeError(
    `theater: smoothWheel: smoothing must be a time in ms, 0 or more (got ${smoothing})`,
  )
}

class Glide {
  private target = 0
  /** Where the glide is, with its fractions: the browser rounds `scrollTop`, and sub-pixel steps would be lost. */
  private current = 0
  private gliding: AbortController | null = null
  private readonly page = pageScroller()

  constructor(private readonly options: SmoothWheelOptions) {
    const listen = { signal: options.signal, passive: false }
    // The frame job ends with the signal too: nothing else to let go on abort.
    window.addEventListener('wheel', (e) => this.wheel(e), listen)
  }

  private wheel(event: WheelEvent): void {
    if (this.native(event)) return
    if (this.movedOnItsOwn()) this.rest()
    const target = this.clamped(this.from() + pixels(event))
    if (target === this.page.scrollTop) return // no room that way: native (an outer frame may scroll)
    event.preventDefault()
    this.target = target
    this.glide()
  }

  /** Sideways, a zoom, a nested scroller, or what the page asked to keep native. */
  private native(event: WheelEvent): boolean {
    const target = event.target instanceof Element ? event.target : null
    if (event.ctrlKey || !target || !vertical(event)) return true
    if (this.options.prevent?.(target)) return true
    return nestedScroller(target, this.page)
  }

  /** Where a new wheel adds to: the glide's target, or the page as it is. */
  private from(): number {
    return this.gliding ? this.target : this.page.scrollTop
  }

  private clamped(top: number): number {
    const room = this.page.scrollHeight - this.page.clientHeight
    return Math.min(Math.max(top, 0), room)
  }

  /** A scrollbar drag, a key, an anchor jump moved the page mid-glide: theirs wins. */
  private movedOnItsOwn(): boolean {
    if (!this.gliding) return false
    return Math.abs(this.page.scrollTop - this.current) > MOVED_PX
  }

  private glide(): void {
    if (this.gliding) return
    this.current = this.page.scrollTop
    this.gliding = new AbortController()
    const step = ({ delta }: { delta: number }) => this.step(delta)
    frames().every('update', step, {
      signal: AbortSignal.any([this.options.signal, this.gliding.signal]),
    })
  }

  /** Each frame closes part of the gap (an exponential glide, frame-rate independent). */
  private step(delta: number): void {
    if (this.movedOnItsOwn()) return this.rest()
    const gap = this.target - this.current
    const arrived = Math.abs(gap) <= REST_PX
    const share = 1 - Math.exp(-delta / (this.options.smoothing ?? 120))
    this.current += arrived ? gap : gap * share
    // `instant`: a page with `scroll-behavior: smooth` would start its own glide on every write
    this.page.scrollTo({ top: this.current, behavior: 'instant' })
    if (arrived) this.rest()
  }

  private rest(): void {
    this.gliding?.abort()
    this.gliding = null
  }
}

/** Mostly up or down, without shift (which turns the wheel sideways). */
function vertical(event: WheelEvent): boolean {
  return !event.shiftKey && Math.abs(event.deltaY) > Math.abs(event.deltaX)
}

/** The wheel's distance in px (lines and pages too). */
function pixels(event: WheelEvent): number {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * 16
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE)
    return event.deltaY * innerHeight
  return event.deltaY
}

/** An ancestor below the page that scrolls vertically (whether or not it has room left that way): it keeps the wheel. */
function nestedScroller(el: Element, page: Element): boolean {
  for (let at: Element | null = el; at && at !== page; at = at.parentElement) {
    const { overflowY } = getComputedStyle(at)
    if (/(auto|scroll)/.test(overflowY) && at.scrollHeight > at.clientHeight)
      return true
  }
  return false
}
