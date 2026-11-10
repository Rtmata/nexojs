import {
  oscillatorOf,
  physicsOf,
  restTime,
  type Oscillator,
  type SpringOptions,
} from './spring'

/** A flung value, slowing down by itself (B.3b). */
export interface InertiaOptions {
  /** Speed at release, in units per second (panel `gesture`, a wheel…). */
  velocity?: number
  /** How far it goes: 1 keeps the release speed at the start. 0.8 by default. */
  power?: number
  /** How long it takes to slow down, in ms. 700 by default. */
  timeConstant?: number
  /** Where it must stay; past an edge it springs back to it. */
  bounds?: { min?: number; max?: number }
  /** The spring at an edge (B.3, either form). Motion's 500 / 10 by default. */
  edge?: SpringOptions
  /** Where it may stop: a function, or the points to choose the nearest of. */
  snap?: ((value: number) => number) | number[]
  /** Resting: this close to the end, in units. Half a pixel by default. */
  restDelta?: number
  /** Resting: slower than this, in units per second. */
  restSpeed?: number
}

type Defaults = Required<
  Pick<
    InertiaOptions,
    'power' | 'timeConstant' | 'edge' | 'restDelta' | 'restSpeed'
  >
>

const DEFAULTS: Defaults = {
  power: 0.8,
  timeConstant: 700,
  edge: { stiffness: 500, damping: 10 },
  restDelta: 0.5,
  restSpeed: 2,
}
const SAMPLE_MS = 10

/** The decay: the target minus a gap that shrinks by e every `timeConstant`. */
class Decay {
  constructor(
    readonly target: number,
    private readonly gap: number,
    readonly seconds: number,
  ) {}

  valueAt(t: number): number {
    return this.target - this.gap * Math.exp(-t / this.seconds)
  }

  velocityAt(t: number): number {
    return (this.gap / this.seconds) * Math.exp(-t / this.seconds)
  }

  /** When it crosses `edge` on its way to a target past it. */
  crossing(edge: number): number {
    return -this.seconds * Math.log((this.target - edge) / this.gap)
  }

  /** When the gap left is under `delta`. */
  restsAfter(delta: number): number {
    const gap = Math.abs(this.gap)
    return gap <= delta ? 0 : this.seconds * Math.log(gap / delta)
  }
}

/** The spring at an edge, after the decay reached it at `start` seconds. */
interface Bounce {
  start: number
  edge: number
  oscillator: Oscillator
}

/**
 * Where a flung value goes, in its own units (B.3b): it decays from the
 * release speed toward a target (`snap` moves the target), and when it
 * would cross an edge it hands its speed to the edge spring. Not a 0 → 1
 * curve: its end is computed and may even be where it started.
 *
 *   const path = new InertiaPath(0, { velocity: -1800, bounds: { min: -4000, max: 0 } })
 *   path.to           // where it rests
 *   path.valueAt(100) // where it is 100 ms in
 */
export class InertiaPath {
  readonly to: number
  readonly duration: number
  private readonly decay: Decay
  private readonly bounce: Bounce | null
  private readonly options: InertiaOptions & Defaults

  constructor(
    readonly from: number,
    options: InertiaOptions,
  ) {
    this.options = { ...DEFAULTS, ...options }
    this.decay = this.decayOf()
    this.bounce = this.bounceOf()
    this.to = this.bounce?.edge ?? this.decay.target
    this.duration = this.restTime()
  }

  valueAt(ms: number): number {
    const t = Math.min(Math.max(ms, 0), this.duration) / 1000
    if (this.bounce && t >= this.bounce.start) {
      return (
        this.bounce.edge + this.bounce.oscillator.offset(t - this.bounce.start)
      )
    }
    return this.decay.valueAt(t)
  }

  /** Units per second: what a new target starts with. */
  velocityAt(ms: number): number {
    if (ms >= this.duration) return 0
    const t = Math.max(ms, 0) / 1000
    if (this.bounce && t >= this.bounce.start) {
      return this.bounce.oscillator.speed(t - this.bounce.start)
    }
    return this.decay.velocityAt(t)
  }

  /** The path every 10 ms, as keyframes for the browser (an element). */
  samples(): number[] {
    const count = Math.max(Math.round(this.duration / SAMPLE_MS), 1)
    return Array.from({ length: count + 1 }, (_, i) =>
      this.valueAt((i * this.duration) / count),
    )
  }

  private decayOf(): Decay {
    const { velocity = 0, power, timeConstant } = this.options
    const seconds = timeConstant / 1000
    const target = snapped(
      this.from + power * velocity * seconds,
      this.options.snap,
    )
    return new Decay(target, target - this.from, seconds)
  }

  private bounceOf(): Bounce | null {
    const outside = this.outside(this.from)
    if (outside !== null) return this.springFrom(0, outside, this.from)
    const crossed = this.outside(this.decay.target)
    if (crossed === null) return null
    const start = this.decay.crossing(crossed)
    return this.springFrom(start, crossed, crossed)
  }

  /** The edge `value` is past, or null when it's inside. */
  private outside(value: number): number | null {
    const { min = -Infinity, max = Infinity } = this.options.bounds ?? {}
    if (value < min) return min
    if (value > max) return max
    return null
  }

  private springFrom(start: number, edge: number, value: number): Bounce {
    const velocity =
      start === 0 ? (this.options.velocity ?? 0) : this.decay.velocityAt(start)
    const release = { offset: value - edge, velocity }
    return {
      start,
      edge,
      oscillator: oscillatorOf(physicsOf(this.options.edge), release),
    }
  }

  private restTime(): number {
    const { restDelta: delta, restSpeed: speed } = this.options
    if (!this.bounce) return Math.ceil(this.decay.restsAfter(delta) * 1000)
    return (
      this.bounce.start * 1000 +
      restTime(this.bounce.oscillator, { delta, speed })
    )
  }
}

/** Where `value` stops once `snap` has its say. */
function snapped(value: number, snap: InertiaOptions['snap']): number {
  if (snap === undefined) return value
  if (typeof snap === 'function') return snap(value)
  if (snap.length === 0)
    throw new RangeError('theater: inertia snap needs at least one point')
  return snap.reduce((best, point) =>
    Math.abs(point - value) < Math.abs(best - value) ? point : best,
  )
}
