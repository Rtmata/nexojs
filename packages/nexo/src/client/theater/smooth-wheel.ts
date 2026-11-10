import { frames } from './frame'
import { reducedMotion } from './reduce'

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

/**
 * The page's wheel, smoothed (D.4, Lenis's model): only the wheel —
 * touch, keys, scrollbars and anchors stay native, and so does the page's
 * own scroll (sticky, find-in-page). Off unless you turn it on; under
 * reduced motion it does nothing. Wheels over a nested scroller, with
 * ctrl (a zoom), or over what `prevent` names scroll natively.
 *
 *   smoothWheel({ signal, prevent: (node) => node.closest('dialog') !== null })
 */
export function smoothWheel(options: SmoothWheelOptions): void {
  if (reducedMotion()) return
  new Glide(options)
}

class Glide {
  private target = 0
  /** Where the glide is, with its fractions: the browser rounds `scrollTop`, and sub-pixel steps would be lost. */
  private current = 0
  private gliding: AbortController | null = null
  private readonly page = document.scrollingElement ?? document.documentElement

  constructor(private readonly options: SmoothWheelOptions) {
    const listen = { signal: options.signal, passive: false }
    window.addEventListener('wheel', (e) => this.wheel(e), listen)
    options.signal.addEventListener('abort', () => this.gliding?.abort(), {
      once: true,
    })
  }

  private wheel(event: WheelEvent): void {
    if (this.native(event)) return
    event.preventDefault()
    if (!this.gliding) this.target = this.current = this.page.scrollTop
    const room = this.page.scrollHeight - this.page.clientHeight
    this.target = Math.min(Math.max(this.target + pixels(event), 0), room)
    this.glide()
  }

  /** A zoom, a nested scroller, or what the page asked to keep native. */
  private native(event: WheelEvent): boolean {
    const target = event.target instanceof Element ? event.target : null
    if (event.ctrlKey || !target) return true
    if (this.options.prevent?.(target)) return true
    return nestedScroller(target, this.page)
  }

  private glide(): void {
    if (this.gliding) return
    this.gliding = new AbortController()
    const step = ({ delta }: { delta: number }) => this.step(delta)
    frames().every('update', step, {
      signal: AbortSignal.any([this.options.signal, this.gliding.signal]),
    })
  }

  /** Each frame closes part of the gap (an exponential glide, frame-rate independent). */
  private step(delta: number): void {
    const gap = this.target - this.current
    const share = 1 - Math.exp(-delta / (this.options.smoothing ?? 120))
    this.current += Math.abs(gap) <= REST_PX ? gap : gap * share
    this.page.scrollTop = this.current
    if (Math.abs(gap) > REST_PX) return
    this.gliding?.abort()
    this.gliding = null
  }
}

/** The wheel's distance in px (lines and pages too). */
function pixels(event: WheelEvent): number {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * 16
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE)
    return event.deltaY * innerHeight
  return event.deltaY
}

/** An ancestor below the page that can still scroll that way: it keeps the wheel. */
function nestedScroller(el: Element, page: Element): boolean {
  for (let at: Element | null = el; at && at !== page; at = at.parentElement) {
    const { overflowY } = getComputedStyle(at)
    if (/(auto|scroll)/.test(overflowY) && at.scrollHeight > at.clientHeight)
      return true
  }
  return false
}
