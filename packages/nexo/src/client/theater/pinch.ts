import type { AnimateOptions } from '../../shared/theater/options'
import type { SpringOptions } from '../../shared/theater/spring'
import { speed, type Sample } from '../../shared/theater/velocity'
import { animate } from './animate'
import type { Playback } from './playback'

export interface PinchOptions {
  /** How far it zooms: 1 to 4 by default. */
  scale?: { min?: number; max?: number }
  /** Two fingers turn it too. */
  rotate?: boolean
  /** Two fingers move it too (then the page doesn't scroll on it: `touch-action: none`). */
  pan?: boolean
  /** Past a limit it follows at this share: 0.35 by default. */
  elastic?: number
  /** The spring back inside the limits on release (B.3). */
  release?: { spring?: SpringOptions }
  signal?: AbortSignal
}

/** A pinchable element's zoom, and a way to zoom it without two fingers (buttons). */
export interface Pinchable {
  readonly scale: number
  set(scale: number, options?: AnimateOptions): Playback
}

const ELASTIC = 0.35
const RELEASE = { duration: 300, bounce: 0.3 }
/** Chrome and Firefox send a trackpad pinch as a ctrl + wheel: this much zoom per wheel unit. */
const WHEEL_ZOOM = 0.01

type Point = { x: number; y: number }

type Listen = (
  target: EventTarget,
  name: string,
  run: (e: any) => void,
  passive?: boolean,
) => void

/** The two fingers: how far apart, at what angle, around which point. */
function spanOf(a: Point, b: Point) {
  return {
    distance: Math.hypot(b.x - a.x, b.y - a.y),
    angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
    middle: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
  }
}

type Span = ReturnType<typeof spanOf>

/**
 * Zooms (and turns, and moves) an element with two fingers or a trackpad
 * (F.2): scale, rotation and offset follow the fingers' distance, angle
 * and middle point; past its limits the zoom stretches, and on release a
 * spring brings it back, at the speed it had (F.1's estimator). Give it
 * zoom buttons too: `set` animates the zoom.
 *
 *   const zoom = pinch(screen, { scale: { min: 1, max: 4 }, pan: true, signal })
 *   plus.onclick = () => zoom.set(zoom.scale * 1.5)
 */
export function pinch(el: HTMLElement, options: PinchOptions = {}): Pinchable {
  return new Pinch(el, options)
}

class Pinch implements Pinchable {
  scale = 1
  private rotation = 0
  private offset = { x: 0, y: 0 }
  private readonly pointers = new Map<number, Point>()
  private start: {
    span: Span
    scale: number
    rotation: number
    offset: Point
  } | null = null
  private samples: Sample[] = []
  private motion = new AbortController()

  constructor(
    private readonly el: HTMLElement,
    private readonly options: PinchOptions,
  ) {
    el.style.touchAction = options.pan ? 'none' : 'pan-x pan-y'
    this.listen(options.signal)
  }

  set(scale: number, options: AnimateOptions = { spring: RELEASE }): Playback {
    const signal = this.restartMotion()
    const write = (v: number) => ((this.scale = v), this.write())
    return animate([this.scale, this.limited(scale)], write, {
      ...options,
      signal,
      reduce: 'jump',
    })
  }

  private listen(signal?: AbortSignal): void {
    const on: Listen = (target, name, run, passive = true) =>
      target.addEventListener(name, run, { signal, passive })
    on(this.el, 'pointerdown', (e: PointerEvent) => this.down(e))
    on(document, 'pointermove', (e: PointerEvent) => this.moved(e))
    on(document, 'pointerup', (e: PointerEvent) => this.up(e))
    on(document, 'pointercancel', (e: PointerEvent) => this.up(e))
    this.listenTrackpad(on)
  }

  /** Trackpads: Chrome / Firefox as ctrl + wheel, Safari with its gesture events (not passive: they zoom the page otherwise). */
  private listenTrackpad(
    on: (
      target: EventTarget,
      name: string,
      run: (e: any) => void,
      passive?: boolean,
    ) => void,
  ): void {
    on(this.el, 'wheel', (e: WheelEvent) => this.wheel(e), false)
    on(this.el, 'gesturestart', (e: Event) => this.gestureStart(e), false)
    on(
      this.el,
      'gesturechange',
      (e: Event & { scale: number }) => this.gestureChange(e),
      false,
    )
  }

  private down(event: PointerEvent): void {
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (this.pointers.size === 2) this.begin()
  }

  private begin(): void {
    this.restartMotion()
    const [a, b] = [...this.pointers.values()] as [Point, Point]
    this.start = {
      span: spanOf(a, b),
      scale: this.scale,
      rotation: this.rotation,
      offset: { ...this.offset },
    }
    this.samples = []
  }

  private moved(event: PointerEvent): void {
    if (!this.pointers.has(event.pointerId)) return
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (this.start && this.pointers.size === 2) this.follow(event.timeStamp)
  }

  /** Scale by the distance, turn by the angle, move by the middle — from where the pinch began. */
  private follow(time: number): void {
    const start = this.start!
    const [a, b] = [...this.pointers.values()] as [Point, Point]
    const now = spanOf(a, b)
    const zoom = now.distance / start.span.distance
    this.scale = this.stretched(start.scale * zoom)
    this.turnAndMove(start, now)
    this.samples.push({ t: time, x: this.scale, y: 0 })
    this.write()
  }

  private turnAndMove(start: NonNullable<Pinch['start']>, now: Span): void {
    const { rotate, pan } = this.options
    if (rotate) this.rotation = start.rotation + now.angle - start.span.angle
    if (pan) this.offset = moved(start.offset, start.span.middle, now.middle)
  }

  private up(event: PointerEvent): void {
    if (!this.pointers.delete(event.pointerId) || !this.start) return
    this.start = null
    this.release(speed(this.samples, 'x'))
  }

  /** Back inside the limits with a spring, starting at the zoom's speed (B.3). */
  private release(velocity: number): void {
    const target = this.limited(this.scale)
    const span = target - this.scale
    if (span === 0) return
    const spring = {
      ...RELEASE,
      ...this.options.release?.spring,
      velocity: velocity / span,
    }
    this.set(target, { spring })
  }

  /** A trackpad pinch in Chrome and Firefox: a wheel with ctrl held. Kept inside the limits. */
  private wheel(event: WheelEvent): void {
    if (!event.ctrlKey) return
    event.preventDefault()
    this.scale = this.limited(this.scale * Math.exp(-event.deltaY * WHEEL_ZOOM))
    this.write()
  }

  /** Safari's trackpad pinch: its own gesture events, `scale` relative to the start. */
  private gestureStart(event: Event): void {
    event.preventDefault()
    this.start = {
      span: spanOf({ x: 0, y: 0 }, { x: 1, y: 0 }),
      scale: this.scale,
      rotation: this.rotation,
      offset: { ...this.offset },
    }
  }

  private gestureChange(event: Event & { scale: number }): void {
    event.preventDefault()
    if (!this.start) return
    this.scale = this.limited(this.start.scale * event.scale)
    this.write()
  }

  private limited(scale: number): number {
    const { min = 1, max = 4 } = this.options.scale ?? {}
    return Math.min(Math.max(scale, min), max)
  }

  /** Past a limit, only part of the way (`elastic`). */
  private stretched(scale: number): number {
    const limit = this.limited(scale)
    return limit + (scale - limit) * (this.options.elastic ?? ELASTIC)
  }

  private restartMotion(): AbortSignal {
    this.motion.abort()
    this.motion = new AbortController()
    const own = this.motion.signal
    return this.options.signal
      ? AbortSignal.any([this.options.signal, own])
      : own
  }

  private write(): void {
    const style = this.el.style
    style.scale = String(this.scale)
    style.rotate = `${this.rotation}deg`
    style.translate = `${this.offset.x}px ${this.offset.y}px`
  }
}

/** `offset` plus how far the middle point went. */
function moved(offset: Point, from: Point, to: Point): Point {
  return { x: offset.x + to.x - from.x, y: offset.y + to.y - from.y }
}
