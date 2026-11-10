import type { Curve } from '../../shared/theater/curve'
import { curveOf, type AnimateOptions } from '../../shared/theater/options'
import { animate } from './animate'
import { applyJumps, cssName, type Keyframes } from './keyframes'
import { writerOf, type Playback, type ValueTarget } from './playback'
import { speedOf } from './speed'
import type { ValueAnimation } from './value'

/** CSS values by property, as a tween's state on an element. */
export type Styles = Record<string, string | number>

/**
 * A value that lives over time (B.1): `set(next)` is exactly `animate`
 * from where it is now to `next`, and returns that `Animation`. A spring
 * keeps the speed it had, so a new target in the middle doesn't jolt.
 */
export interface Tween<T> {
  set(next: T, options?: AnimateOptions): Playback
}

/**
 * One trip at a time: starting the next stops the last where it is
 * (B.5b), and each trip also stops with the caller's signal.
 */
class Trips {
  private current = new AbortController()

  next(options: AnimateOptions): AnimateOptions {
    this.current.abort()
    this.current = new AbortController()
    const own = this.current.signal
    const signal = options.signal ? AbortSignal.any([options.signal, own]) : own
    return { ...options, signal }
  }
}

/** A spring starts at `velocity` (units per second) over a `span`-long trip. */
function withVelocity(
  options: AnimateOptions,
  velocity: number,
  span: number,
): AnimateOptions {
  if (!options.spring || span === 0 || velocity === 0) return options
  const spring = { ...options.spring, velocity: velocity / span }
  return { ...options, spring }
}

/** A number written through a function or a signal (anything with `set`). */
class ValueTween implements Tween<number> {
  private current: number
  private running: ValueAnimation | null = null
  private readonly trips = new Trips()
  private readonly write: (value: number) => void

  constructor(
    target: ValueTarget<number>,
    initial: number,
    private readonly options: AnimateOptions,
  ) {
    this.write = writerOf(target)
    this.current = initial
    this.write(initial)
  }

  set(next: number, override: AnimateOptions = {}): Playback {
    const velocity = this.running?.velocity ?? 0
    const options = this.trips.next({ ...this.options, ...override })
    const timed = withVelocity(options, velocity, next - this.current)
    const write = (value: number) => ((this.current = value), this.write(value))
    this.running = animate([this.current, next], write, timed)
    return this.running
  }
}

/** The trip an element tween is on: enough to know its speed now. */
interface Trip {
  animation: Playback
  curve: Curve
  delay: number
  span: number | null
  /** Set once it finished or stopped: then it has no speed left. */
  over: boolean
}

/** CSS properties of an element; each `set` starts from what is shown now. */
class ElementTween implements Tween<Styles> {
  private trip: Trip | null = null
  private readonly trips = new Trips()

  constructor(
    private readonly el: Element,
    initial: Styles,
    private readonly options: AnimateOptions,
  ) {
    const entries = Object.entries(initial).map(([p, v]) => [p, String(v)])
    applyJumps(el, new Map(entries as [string, string][]))
  }

  set(next: Styles, override: AnimateOptions = {}): Playback {
    const from = this.shown(Object.keys(next))
    const span = firstSpan(from, next)
    const velocity = this.unitVelocity()
    const options = this.trips.next({ ...this.options, ...override })
    const timed = withVelocity(options, velocity, span ?? 0)
    return this.start(keyframesOf(from, next), timed, span)
  }

  private start(
    keyframes: Keyframes,
    options: AnimateOptions,
    span: number | null,
  ): Playback {
    const animation = animate(this.el, keyframes, options)
    this.trip = tripOf(animation, options, speedOf(this.el), span)
    return animation
  }

  /** What the element shows now, mid-animation included. */
  private shown(properties: string[]): Styles {
    const style = getComputedStyle(this.el)
    const values = properties.map((p) => [
      p,
      style.getPropertyValue(cssName(p)),
    ])
    return Object.fromEntries(values)
  }

  /**
   * The trip's speed in units per second, from its curve; 0 once it is
   * over. A paused trip keeps its curve's speed (the test clock pauses
   * animations to hold time).
   */
  private unitVelocity(): number {
    const trip = this.trip
    if (!trip?.span || trip.over) return 0
    const elapsed = Number(trip.animation.currentTime ?? 0) - trip.delay
    return trip.curve.velocityAt(elapsed) * trip.span
  }
}

/** The trip a new animation starts, marked over once it ends either way. */
function tripOf(
  animation: Playback,
  options: AnimateOptions,
  speed: number,
  span: number | null,
): Trip {
  const [curve, delay] = [curveOf(options, speed), (options.delay ?? 0) / speed]
  const trip = { animation, curve, delay, span, over: false }
  const end = () => (trip.over = true)
  animation.finished.then(end, end)
  return trip
}

/** `{ scale: ['1', '1.05'] }`: from what is shown to what is asked. */
function keyframesOf(from: Styles, next: Styles): Keyframes {
  const pairs = Object.keys(next).map((p) => [
    p,
    [String(from[p]), String(next[p])],
  ])
  return Object.fromEntries(pairs)
}

/** A plain number with an optional unit: `1.05`, `120px`, `45deg`. */
const SINGLE = /^\s*(-?[\d.]+(?:e-?\d+)?)([a-z%]*)\s*$/i

/**
 * The span of the first property whose start and end are single numbers
 * in one unit: what a spring's speed is measured against. Several-number
 * values (`translate: 0 24px`) don't carry speed.
 */
function firstSpan(from: Styles, next: Styles): number | null {
  for (const property of Object.keys(next)) {
    const a = SINGLE.exec(String(from[property]))
    const b = SINGLE.exec(String(next[property]))
    if (a && b && a[2] === b[2]) return Number(b[1]) - Number(a[1])
  }
  return null
}

/**
 * A value that lives over time (B.1), on an element or a value: give it
 * where it starts; each `set(next)` animates from where it is now and
 * returns that `Animation`. On an element it stays on WAAPI (A.2).
 *
 *   const size = tween(cover, { scale: 1 }, { spring: { duration: 300 } })
 *   cover.onpointerenter = () => size.set({ scale: 1.05 })
 *
 *   const count = tween((n) => (out.textContent = String(Math.round(n))), 0)
 *   count.set(1200)
 */
export function tween(
  el: Element,
  initial: Styles,
  options?: AnimateOptions,
): Tween<Styles>
export function tween(
  target: ValueTarget<number>,
  initial: number,
  options?: AnimateOptions,
): Tween<number>
export function tween(
  target: Element | ValueTarget<number>,
  initial: Styles | number,
  options: AnimateOptions = {},
): Tween<Styles> | Tween<number> {
  if (target instanceof Element) {
    return new ElementTween(target, initial as Styles, options)
  }
  return new ValueTween(target, initial as number, options)
}
