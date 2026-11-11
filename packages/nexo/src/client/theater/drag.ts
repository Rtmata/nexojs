import type { InertiaOptions } from '../../shared/theater/inertia'
import type { AnimateOptions } from '../../shared/theater/options'
import type { SpringOptions } from '../../shared/theater/spring'
import { animate } from './animate'
import { elasticOf, GestureMotion } from './gesture'
import { AnimationGroup } from './group'
import type { Playback } from './playback'
import { PointerTrack, type TrackEvents } from './pointer'

export interface Bounds {
  min?: number
  max?: number
}

export interface DragOptions {
  /** `both` by default. The other way keeps scrolling (`touch-action`). */
  axis?: 'x' | 'y' | 'both'
  /** Where it may go, in px from where it started; per axis for `both`. */
  bounds?: Bounds | { x?: Bounds; y?: Bounds }
  /** Past a bound it follows at this share of the pointer: 0 stops, 1 is free. 0.35 by default (Motion's). */
  elastic?: number
  /** After release: inertia (B.3b) by default, or a spring back inside the bounds. */
  release?: {
    inertia?: Omit<InertiaOptions, 'velocity' | 'bounds'>
    spring?: SpringOptions
  }
  signal?: AbortSignal
}

/** A dragged element's place, and a way to move it without dragging (WCAG 2.5.7). */
export interface Draggable {
  readonly x: number
  readonly y: number
  set(to: { x?: number; y?: number }, options?: AnimateOptions): Playback
}

/** A press that hardly moves is a tap, not a drag (Android's touch slop, 8 dp). */
const SLOP = 8
const SET_SPRING = { duration: 400 }
/** The way that keeps scrolling, per axis; its keys are the axes `drag` takes. */
const TOUCH_ACTION = { x: 'pan-y', y: 'pan-x', both: 'none' } as const

/** One axis of a drag: where it is, and its bounds. */
class Axis {
  value = 0

  constructor(
    readonly name: 'x' | 'y',
    readonly bounds: Bounds,
    private readonly elastic: number,
  ) {
    checkBounds(name, bounds)
  }

  /** Past a bound, the pointer pulls it only part of the way. */
  constrain(raw: number): number {
    const { min = -Infinity, max = Infinity } = this.bounds
    if (raw < min) return min - (min - raw) * this.elastic
    if (raw > max) return max + (raw - max) * this.elastic
    return raw
  }

  clamped(): number {
    const { min = -Infinity, max = Infinity } = this.bounds
    return Math.min(Math.max(this.value, min), max)
  }
}

function axisOf(options: DragOptions): 'x' | 'y' | 'both' {
  const axis = options.axis ?? 'both'
  if (Object.hasOwn(TOUCH_ACTION, axis)) return axis
  throw new RangeError(
    `theater: drag's axis is 'x', 'y' or 'both', got ${String(axis)}`,
  )
}

/** Unset sides are open; NaN fails the comparison too. */
function checkBounds(name: 'x' | 'y', bounds: Bounds): void {
  const { min = -Infinity, max = Infinity } = bounds
  if (min <= max) return
  throw new RangeError(
    `theater: drag's bounds on ${name} need numbers with min ≤ max, got ${min} and ${max}`,
  )
}

function boundsFor(
  name: 'x' | 'y',
  bounds: DragOptions['bounds'] = {},
): Bounds {
  const perAxis = 'x' in bounds || 'y' in bounds
  return perAxis
    ? ((bounds as { x?: Bounds; y?: Bounds })[name] ?? {})
    : (bounds as Bounds)
}

/**
 * Drags an element with the pointer (F.1): it follows through `translate`,
 * stretching past its bounds, and on release keeps the pointer's real
 * speed — inertia with its edge spring and snap (B.3b) — or springs back
 * inside. A press that hardly moves stays a click. Give the same moves a
 * button too (WCAG 2.5.7): `set` animates it there.
 *
 *   const shelfDrag = drag(shelf, { axis: 'x', bounds: { min: -4000, max: 0 },
 *     release: { inertia: { snap: (x) => Math.round(x / 220) * 220 } }, signal })
 *   next.onclick = () => shelfDrag.set({ x: shelfDrag.x - 220 })
 */
export function drag(el: HTMLElement, options: DragOptions = {}): Draggable {
  return new Drag(el, options)
}

class Drag implements Draggable, TrackEvents {
  private readonly axes: Axis[]
  private start = { x: 0, y: 0 }
  private tracking = false
  private readonly motion: GestureMotion

  constructor(
    private readonly el: HTMLElement,
    private readonly options: DragOptions,
  ) {
    const axis = axisOf(options)
    const names = axis === 'both' ? (['x', 'y'] as const) : [axis]
    const elastic = elasticOf(options.elastic, 'drag')
    this.axes = names.map(
      (n) => new Axis(n, boundsFor(n, options.bounds), elastic),
    )
    this.motion = new GestureMotion(options.signal)
    el.style.touchAction = TOUCH_ACTION[axis]
    this.listen(options.signal)
  }

  /** An abort mid-drag takes the track's listeners too: no `end` will come to stop it. */
  private listen(signal?: AbortSignal): void {
    this.el.addEventListener('pointerdown', (e) => this.down(e), { signal })
    signal?.addEventListener('abort', () => this.stopTracking(), {
      once: true,
    })
  }

  get x(): number {
    return this.axes.find((a) => a.name === 'x')?.value ?? 0
  }

  get y(): number {
    return this.axes.find((a) => a.name === 'y')?.value ?? 0
  }

  set(
    to: { x?: number; y?: number },
    options: AnimateOptions = { spring: SET_SPRING },
  ): Playback {
    this.checkTarget(to)
    this.motion.restart()
    const signal = this.motion.signal
    const moving = this.axes.filter((axis) => to[axis.name] !== undefined)
    const run = (axis: Axis) =>
      this.run(axis, [axis.value, to[axis.name]!], { ...options, signal })
    return new AnimationGroup(moving.map(run))
  }

  /** `{ left: 10 }`, or `y` on an `x` drag, would otherwise do nothing, silently. */
  private checkTarget(to: Record<string, unknown>): void {
    const names = this.axes.map((axis) => axis.name as string)
    for (const [key, value] of Object.entries(to)) {
      if (names.includes(key)) checkPlace(key, value)
      else
        throw new TypeError(
          `theater: this drag's set takes ${names.join(' and ')}, got ${key}`,
        )
    }
  }

  private down(event: PointerEvent): void {
    if (event.button !== 0 || this.tracking) return
    this.motion.restart()
    this.tracking = true
    this.start = { x: this.x, y: this.y }
    const signal = this.options.signal ?? new AbortController().signal
    new PointerTrack(event, this, signal)
  }

  move(track: PointerTrack): void {
    this.el.setAttribute('data-dragging', '')
    for (const axis of this.axes)
      axis.value = axis.constrain(
        this.start[axis.name] + track.offset[axis.name],
      )
    this.write()
  }

  end(track: PointerTrack, released: boolean): void {
    this.stopTracking()
    if (Math.hypot(track.offset.x, track.offset.y) >= SLOP)
      swallowClick(this.el)
    this.motion.restart()
    const signal = this.motion.signal
    for (const axis of this.axes)
      this.release(axis, released ? track.velocity[axis.name] : 0, signal)
  }

  /** Inertia from the pointer's speed (B.3b), or a spring back inside the bounds. */
  private release(axis: Axis, velocity: number, signal: AbortSignal): void {
    const { inertia, spring } = this.options.release ?? {}
    if (spring)
      return void this.run(axis, [axis.value, axis.clamped()], {
        spring,
        signal,
      })
    const fling = { ...inertia, velocity, bounds: axis.bounds }
    this.run(axis, [axis.value], { inertia: fling, signal })
  }

  /** A value animation of one axis; under reduced motion it jumps (C.1: it moves the element). */
  private run(
    axis: Axis,
    keyframes: number[],
    options: AnimateOptions,
  ): Playback {
    const write = (v: number) => ((axis.value = v), this.write())
    return animate(keyframes, write, { ...options, reduce: 'jump' })
  }

  private stopTracking(): void {
    this.tracking = false
    this.el.removeAttribute('data-dragging')
  }

  private write(): void {
    this.el.style.translate = `${this.x}px ${this.y}px`
  }
}

function checkPlace(name: string, value: unknown): void {
  if (value === undefined || Number.isFinite(value)) return
  throw new RangeError(
    `theater: drag's set takes ${name} in px (a finite number), got ${String(value)}`,
  )
}

/** After a real drag, the click it ends with is not a click on what was under it. */
function swallowClick(el: HTMLElement): void {
  const swallow = (event: Event) => (
    event.preventDefault(),
    event.stopPropagation()
  )
  el.addEventListener('click', swallow, { capture: true, once: true })
  setTimeout(
    () => el.removeEventListener('click', swallow, { capture: true }),
    0,
  )
}
