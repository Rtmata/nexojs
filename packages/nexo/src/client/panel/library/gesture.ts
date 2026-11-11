import { panel } from '../panel'
import { boolean, number, oneOf } from '../params'
import { emit } from './hold'
import { Marks } from './marks'
import { speed } from '../../../shared/theater/velocity'
import { PointerTrack } from '../../theater/pointer'

/**
 * Gestures (Archive's swipe, and more): a tap, a swipe in four directions,
 * and optionally the element following the pointer meanwhile. Pointer
 * Events for touch, pen and mouse alike, one pointer at a time (a second
 * finger is ignored). `touch-action` is set by `axis` so the browser keeps
 * scrolling the other way (`x` → `pan-y`); when it takes the pointer over
 * (`pointercancel`) the gesture ends with nothing. The pointer is followed
 * on the document, not captured: a capture would redirect the click to the
 * element and take it from the buttons and links inside. Velocity is a
 * least-squares fit over the last 100 ms (Android's VelocityTracker
 * window); a pointer still for 40 ms has none.
 *
 * Events: `gesture:tap`, `gesture:swipe` with `{ direction, distance,
 * velocity }`. With `follow`, CSS sees `--gesture-x` / `--gesture-y` and
 * `data-gesturing` while it moves, and `data-flung` after a swipe. A swipe
 * needs a single-pointer twin (WCAG 2.5.1): give the same action buttons.
 */
export const gesture = panel({
  params: {
    axis: oneOf(['x', 'y', 'both'], 'both'),
    threshold: number(40),
    velocity: number(300),
    follow: boolean(),
  },
  connect: (el, params, { signal }) =>
    new Gesture(el as HTMLElement, params, signal),
  events: { pointerdown: (e, ctx) => ctx.down(e as PointerEvent) },
})

interface Params {
  axis: 'x' | 'y' | 'both'
  threshold: number
  velocity: number
  follow: boolean
}

/** A press that hardly moves is a tap (Android's touch slop, 8 dp). */
const SLOP = 8

class Gesture {
  private readonly marks = new Marks()
  private track: PointerTrack | null = null

  constructor(
    private readonly el: HTMLElement,
    private readonly params: Params,
    private readonly signal: AbortSignal,
  ) {
    const action = { x: 'pan-y', y: 'pan-x', both: 'none' }[params.axis]
    this.marks.style(el, 'touch-action', action)
    signal.addEventListener('abort', () => this.abort(), { once: true })
  }

  /** One pointer at a time, followed by theater's `PointerTrack` (F.1: one tracker, one velocity). */
  down(event: PointerEvent): void {
    if (event.button !== 0 || this.track) return
    this.marks.toggle(this.el, 'data-flung', false)
    const events = {
      move: (track: PointerTrack) => this.params.follow && this.follow(track),
      end: (track: PointerTrack, released: boolean) =>
        this.ended(track, released),
    }
    this.track = new PointerTrack(event, events, this.signal)
  }

  /** Released or cancelled: a tap, a swipe, or nothing (`pointercancel`). */
  private ended(track: PointerTrack, released: boolean): void {
    if (released) this.finish(track)
    this.end()
  }

  private finish(track: PointerTrack): void {
    const { x: dx, y: dy } = track.offset
    if (Math.hypot(dx, dy) < SLOP) emit(this.el, 'gesture:tap')
    else this.swipe(dx, dy, track)
  }

  private end(): void {
    this.track = null
    if (!this.params.follow) return
    this.marks.style(this.el, '--gesture-x', '')
    this.marks.style(this.el, '--gesture-y', '')
    this.marks.toggle(this.el, 'data-gesturing', false)
  }

  private abort(): void {
    this.end()
    this.marks.restore()
  }

  private swipe(dx: number, dy: number, track: PointerTrack): void {
    const horizontal = this.isHorizontal(dx, dy)
    const distance = Math.abs(horizontal ? dx : dy)
    const velocity = Math.abs(track.velocity[horizontal ? 'x' : 'y'])
    if (distance < this.params.threshold && velocity < this.params.velocity)
      return
    const direction = directionOf(horizontal, horizontal ? dx : dy)
    this.marks.toggle(this.el, 'data-flung', true)
    emit(this.el, 'gesture:swipe', { direction, distance, velocity })
  }

  private isHorizontal(dx: number, dy: number): boolean {
    if (this.params.axis !== 'both') return this.params.axis === 'x'
    return Math.abs(dx) >= Math.abs(dy)
  }

  private follow(track: PointerTrack): void {
    const { x: dx, y: dy } = track.offset
    const x = this.params.axis === 'y' ? 0 : dx
    const y = this.params.axis === 'x' ? 0 : dy
    this.marks.style(this.el, '--gesture-x', `${x}px`)
    this.marks.style(this.el, '--gesture-y', `${y}px`)
    this.marks.toggle(this.el, 'data-gesturing', true)
  }
}

function directionOf(horizontal: boolean, delta: number): string {
  if (horizontal) return delta < 0 ? 'left' : 'right'
  return delta < 0 ? 'up' : 'down'
}
