import { panel } from '../panel'
import { boolean, number, oneOf } from '../params'
import { emit, followPointer } from './hold'
import { Marks } from './marks'

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

type Sample = { t: number; x: number; y: number }

/** A press that hardly moves is a tap (Android's touch slop, 8 dp). */
const SLOP = 8
const WINDOW = 100
const STILL = 40

class Gesture {
  private readonly marks = new Marks()
  private samples: Sample[] = []
  private pointer?: number

  constructor(
    private readonly el: HTMLElement,
    private readonly params: Params,
    private readonly signal: AbortSignal,
  ) {
    const action = { x: 'pan-y', y: 'pan-x', both: 'none' }[params.axis]
    this.marks.style(el, 'touch-action', action)
    signal.addEventListener('abort', () => this.abort(), { once: true })
  }

  down(event: PointerEvent): void {
    if (event.button !== 0 || this.pointer !== undefined) return
    this.pointer = event.pointerId
    this.samples = [sample(event)]
    this.marks.toggle(this.el, 'data-flung', false)
    const on = {
      move: (e: PointerEvent) => this.move(e),
      up: (e: PointerEvent) => this.up(e),
    }
    followPointer(event.pointerId, on, this.signal)
  }

  private move(event: PointerEvent): void {
    for (const e of event.getCoalescedEvents?.() ?? [event])
      this.samples.push(sample(e))
    if (this.params.follow) this.follow()
  }

  /** Released or cancelled: a tap, a swipe, or nothing (`pointercancel`). */
  private up(event: PointerEvent): void {
    if (event.type === 'pointerup') this.finish(event)
    this.end()
  }

  private finish(event: PointerEvent): void {
    this.samples.push(sample(event))
    const [dx, dy] = this.distance()
    if (Math.hypot(dx, dy) < SLOP) emit(this.el, 'gesture:tap')
    else this.swipe(dx, dy)
  }

  private end(): void {
    this.pointer = undefined
    this.samples = []
    this.marks.style(this.el, '--gesture-x', '')
    this.marks.style(this.el, '--gesture-y', '')
    this.marks.toggle(this.el, 'data-gesturing', false)
  }

  private abort(): void {
    this.end()
    this.marks.restore()
  }

  private swipe(dx: number, dy: number): void {
    const horizontal = this.isHorizontal(dx, dy)
    const distance = Math.abs(horizontal ? dx : dy)
    const velocity = Math.abs(speed(this.samples, horizontal ? 'x' : 'y'))
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

  private distance(): [number, number] {
    const first = this.samples[0]!
    const last = this.samples.at(-1)!
    return [last.x - first.x, last.y - first.y]
  }

  private follow(): void {
    const [dx, dy] = this.distance()
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

function sample(event: PointerEvent): Sample {
  return { t: event.timeStamp, x: event.clientX, y: event.clientY }
}

/** px/s along one axis: a least-squares line over the last 100 ms; none if the pointer stood still. */
export function speed(samples: Sample[], axis: 'x' | 'y'): number {
  const last = samples.at(-1)
  if (!last) return 0
  const recent = samples.filter((s) => last.t - s.t <= WINDOW)
  const previous = recent.at(-2)
  if (recent.length < 2 || (previous && last.t - previous.t > STILL)) return 0
  return slope(recent.map((s) => [s.t, s[axis]] as const)) * 1000
}

function slope(points: readonly (readonly [number, number])[]): number {
  const mean = (i: 0 | 1) =>
    points.reduce((sum, p) => sum + p[i], 0) / points.length
  const [mt, mv] = [mean(0), mean(1)]
  const covariance = points.reduce(
    (sum, [t, v]) => sum + (t - mt) * (v - mv),
    0,
  )
  const variance = points.reduce((sum, [t]) => sum + (t - mt) ** 2, 0)
  return variance === 0 ? 0 : covariance / variance
}
