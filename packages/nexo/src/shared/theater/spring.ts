import type { Curve } from './curve'
import { toCss } from './easing/to-css'

/** "400 ms, a little bounce" (B.3): how it looks, not how it's built. */
export interface PerceptualSpring {
  /** About how long it takes to arrive, in ms. 500 by default (SwiftUI). */
  duration?: number
  /** -1 < bounce < 1: 0 doesn't overshoot, more overshoots more. */
  bounce?: number
}

/** The physical oscillator, as Figma or Motion write it (B.3). */
export interface PhysicalSpring {
  stiffness: number
  damping: number
  /** 1 by default. */
  mass?: number
}

/** Either form, plus where it starts and when it counts as resting. */
export type SpringOptions = (PerceptualSpring | PhysicalSpring) & {
  /** Initial speed toward the end, in fractions of the distance per second. */
  velocity?: number
  /** Resting: this close to the end (a fraction of the distance). */
  restDelta?: number
  /** Resting: slower than this (fractions of the distance per second). */
  restSpeed?: number
}

/** SwiftUI's `Spring()`: 0.5 s, no bounce (`init(duration: 0.5, bounce: 0.0)`). */
const DEFAULT_DURATION = 500
const DEFAULT_BOUNCE = 0
/** A thousandth of the distance: 1 px of a 1000 px move. */
const DEFAULT_REST_DELTA = 0.001
const DEFAULT_REST_SPEED = 0.01
/** Motion's limit too (`maxGeneratorDuration`): a spring still moving after 20 s is a mistake. */
const LONGEST_MS = 20_000
const SETTLE_STEP_MS = 10

/** Stiffness, damping and mass, however the spring was written. */
export interface Physics {
  stiffness: number
  damping: number
  mass: number
}

/**
 * The perceptual form translated to the physical one by SwiftUI's model,
 * mass 1 (WWDC23 "Animate with springs"; Flutter's `withDurationAndBounce`
 * and Motion agree): stiffness = (2π / duration)², damping ratio = 1 −
 * bounce (or 1 / (1 + bounce) below 0), damping = 2 · ratio · √stiffness.
 */
export function physicsOf(options: SpringOptions): Physics {
  if ('stiffness' in options) return physical(options)
  const seconds = checkedDuration(options.duration ?? DEFAULT_DURATION) / 1000
  const bounce = checkedBounce(options.bounce ?? DEFAULT_BOUNCE)
  const stiffness = ((2 * Math.PI) / seconds) ** 2
  const ratio = bounce < 0 ? 1 / (1 + bounce) : 1 - bounce
  return { stiffness, damping: 2 * ratio * Math.sqrt(stiffness), mass: 1 }
}

function physical(options: PhysicalSpring): Physics {
  const physics = { mass: 1, ...options }
  const valid =
    physics.stiffness > 0 && physics.damping >= 0 && physics.mass > 0
  if (valid) return physics
  throw new RangeError(
    'theater: a spring needs stiffness > 0, damping ≥ 0 and mass > 0',
  )
}

/** Squared into the stiffness, a negative duration would pass for a positive one. */
function checkedDuration(duration: number): number {
  if (duration > 0 && Number.isFinite(duration)) return duration
  throw new RangeError(
    `theater: a spring's duration is in ms and above 0, got ${duration}`,
  )
}

function checkedBounce(bounce: number): number {
  if (bounce > -1 && bounce < 1) return bounce
  throw new RangeError(
    `theater: a spring's bounce goes between -1 and 1 (not included), got ${bounce}`,
  )
}

/** Where a spring is let go: its distance from rest and its speed (per second). */
export interface Release {
  offset: number
  velocity: number
}

/** Where a released spring is (pattern: strategy, one per damping regime). */
export interface Oscillator {
  /** Distance from rest at `t` seconds after the release. */
  offset(t: number): number
  /** Its derivative, per second. */
  speed(t: number): number
  /** The farthest from rest it gets from `t` on: where it may count as resting. */
  reach(t: number): number
}

/** Bounces: it overshoots and swings back, ever smaller. */
class Underdamped implements Oscillator {
  private readonly frequency: number
  private readonly cosine: number
  private readonly sine: number

  constructor(
    private readonly decay: number,
    natural: number,
    ratio: number,
    release: Release,
  ) {
    this.frequency = natural * Math.sqrt(1 - ratio * ratio)
    this.cosine = release.offset
    this.sine = (release.velocity + decay * release.offset) / this.frequency
  }

  offset(t: number): number {
    return Math.exp(-this.decay * t) * this.wave(this.frequency * t)
  }

  speed(t: number): number {
    const angle = this.frequency * t
    const turn = this.sine * Math.cos(angle) - this.cosine * Math.sin(angle)
    const inside = this.frequency * turn - this.decay * this.wave(angle)
    return Math.exp(-this.decay * t) * inside
  }

  /** The envelope: a bounce never swings past it, whatever the phase at `t`. */
  reach(t: number): number {
    return Math.exp(-this.decay * t) * Math.hypot(this.cosine, this.sine)
  }

  private wave(angle: number): number {
    return this.cosine * Math.cos(angle) + this.sine * Math.sin(angle)
  }
}

/** Arrives as fast as it can without overshooting. */
class Critical implements Oscillator {
  private readonly start: number
  private readonly slope: number

  constructor(
    private readonly natural: number,
    release: Release,
  ) {
    this.start = release.offset
    this.slope = release.velocity + natural * release.offset
  }

  offset(t: number): number {
    return Math.exp(-this.natural * t) * (this.start + this.slope * t)
  }

  speed(t: number): number {
    const line = this.start + this.slope * t
    return Math.exp(-this.natural * t) * (this.slope - this.natural * line)
  }

  /** At most one turning point: past it, it only comes closer. */
  reach(t: number): number {
    const turn = 1 / this.natural - this.start / this.slope // ±Infinity or NaN when it has none
    return farthest(this, t, turn)
  }
}

/** Creeps in: two decays, the slow one last. */
class Overdamped implements Oscillator {
  private readonly fast: number
  private readonly slow: number
  private readonly fastPart: number
  private readonly slowPart: number

  constructor(natural: number, ratio: number, release: Release) {
    const spread = natural * Math.sqrt(ratio * ratio - 1)
    this.slow = -ratio * natural + spread
    this.fast = -ratio * natural - spread
    const pull = release.velocity - this.slow * release.offset
    this.fastPart = pull / (this.fast - this.slow)
    this.slowPart = release.offset - this.fastPart
  }

  offset(t: number): number {
    const slow = this.slowPart * Math.exp(this.slow * t)
    return slow + this.fastPart * Math.exp(this.fast * t)
  }

  speed(t: number): number {
    const slow = this.slowPart * this.slow * Math.exp(this.slow * t)
    return slow + this.fastPart * this.fast * Math.exp(this.fast * t)
  }

  /** At most one turning point: past it, it only comes closer. */
  reach(t: number): number {
    const ratio = -(this.slowPart * this.slow) / (this.fastPart * this.fast)
    const turn = Math.log(ratio) / (this.fast - this.slow) // NaN when it has none
    return farthest(this, t, turn)
  }
}

/**
 * The farthest an oscillator with at most one turning point gets from
 * `t` on: where it is now, or the turn still ahead, whichever is
 * farther (it may cross rest before turning). No finite turn ahead: now.
 */
function farthest(oscillator: Oscillator, t: number, turn: number): number {
  const now = Math.abs(oscillator.offset(t))
  if (!(Number.isFinite(turn) && turn > t)) return now
  return Math.max(now, Math.abs(oscillator.offset(turn)))
}

/** Close enough to 1 to solve as critical: the formulas meet there. */
const CRITICAL_BAND = 1e-6

/**
 * The oscillator for these physics, let go at `release`. Exact solutions
 * of m·x'' = −k·x − c·x', one per damping regime.
 */
export function oscillatorOf(physics: Physics, release: Release): Oscillator {
  const natural = Math.sqrt(physics.stiffness / physics.mass)
  const ratio =
    physics.damping / (2 * Math.sqrt(physics.stiffness * physics.mass))
  if (Math.abs(ratio - 1) < CRITICAL_BAND) return new Critical(natural, release)
  if (ratio < 1)
    return new Underdamped(ratio * natural, natural, ratio, release)
  return new Overdamped(natural, ratio, release)
}

/**
 * A spring as a curve (B.3): the same oscillator for elements (sampled
 * into `linear()`) and values (read each frame). It runs until it rests —
 * that is its `duration`, so it fits in a sequence.
 *
 *   const curve = new SpringCurve({ duration: 400, bounce: 0.2 })
 *   curve.duration // when it rests, in ms
 *   curve.at(200)  // progress, may pass 1
 */
export class SpringCurve implements Curve {
  readonly duration: number
  private readonly oscillator: Oscillator

  constructor(options: SpringOptions = {}) {
    this.oscillator = oscillatorOf(physicsOf(options), {
      offset: -1,
      velocity: options.velocity ?? 0,
    })
    this.duration = restTime(this.oscillator, {
      delta: options.restDelta ?? DEFAULT_REST_DELTA,
      speed: options.restSpeed ?? DEFAULT_REST_SPEED,
    })
  }

  at(ms: number): number {
    if (ms >= this.duration) return 1
    return 1 + this.oscillator.offset(Math.max(ms, 0) / 1000)
  }

  velocityAt(ms: number): number {
    if (ms >= this.duration) return 0
    return this.oscillator.speed(Math.max(ms, 0) / 1000)
  }

  toCss(): string {
    return toCss((progress) => this.at(progress * this.duration), this.duration)
  }
}

/** When a spring counts as resting: how close and how slow. */
export interface Rest {
  delta: number
  speed: number
}

/**
 * The first 10 ms step where the oscillator is slow enough and will stay
 * close enough: its reach, not its offset there, since a bounce passing
 * near rest is close for a moment and swings out again.
 */
export function restTime(oscillator: Oscillator, rest: Rest): number {
  for (let ms = 0; ms <= LONGEST_MS; ms += SETTLE_STEP_MS) {
    if (rests(oscillator, ms / 1000, rest)) return ms
  }
  throw new RangeError(
    'theater: this spring is still moving after 20 s; give it more damping or a shorter duration',
  )
}

function rests(oscillator: Oscillator, t: number, rest: Rest): boolean {
  const close = oscillator.reach(t) < rest.delta
  return close && Math.abs(oscillator.speed(t)) < rest.speed
}
