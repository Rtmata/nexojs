import type { Curve } from '../../shared/theater/curve'
import { InertiaPath } from '../../shared/theater/inertia'
import {
  curveOf,
  delayOf,
  iterationsOf,
  type AnimateOptions,
} from '../../shared/theater/options'
import { frames } from './frame'
import { abortError, deferred, isValueTarget, type Playback } from './playback'
import { reducedMotion } from './reduce'

/** Where a value is at a moment of one iteration, and how long one lasts. */
export interface Track {
  readonly duration: number
  valueAt(ms: number): number
  /** Units per second at `ms`: what a new target starts with (B.1). */
  velocityAt(ms: number): number
}

/**
 * Keyframes along a curve: evenly spaced stops, as WAAPI spaces them, and
 * the curve's progress (which may overshoot) placed between them.
 *
 *   new KeyframeTrack([0, 1200], curve).valueAt(400)
 */
export class KeyframeTrack implements Track {
  constructor(
    private readonly keyframes: number[],
    private readonly curve: Curve,
  ) {}

  get duration(): number {
    return this.curve.duration
  }

  velocityAt(ms: number): number {
    const { index, gaps } = this.segmentAt(ms)
    const span = this.keyframes[index + 1]! - this.keyframes[index]!
    return span * gaps * this.curve.velocityAt(ms)
  }

  valueAt(ms: number): number {
    const { index, place } = this.segmentAt(ms)
    const [from, to] = [this.keyframes[index]!, this.keyframes[index + 1]!]
    return from + (to - from) * (place - index)
  }

  /** The curve's progress at `ms` across all the gaps, and the gap it is in. */
  private segmentAt(ms: number) {
    const gaps = this.keyframes.length - 1
    const place = this.curve.at(ms) * gaps
    const index = Math.min(Math.max(Math.floor(place), 0), gaps - 1)
    return { gaps, place, index }
  }
}

/** WAAPI's timing, for values. */
export interface ValueTiming {
  delay: number
  iterations: number
  direction: PlaybackDirection
  /** Held after the end, in ms: a sequence ends all its parts together. */
  endDelay?: number
}

/**
 * A value animated on theater's frame loop (A.2), shaped as WAAPI's
 * `Animation` (B.1) and moving between its states as WAAPI's does. Each
 * frame it writes where the track is. `finish()` writes the end,
 * `cancel()` writes the start (WAAPI: the effect goes away); aborting the
 * signal stops it where it is (B.5b). `finished` rejects with an
 * AbortError on both, as WAAPI's does, and with the error when a write
 * throws.
 */
export class ValueAnimation implements Playback {
  playbackRate = 1
  private time = 0
  private state: AnimationPlayState = 'idle'
  /** The frame job, while it runs. */
  private ticking: AbortController | null = null
  /** The caller's signal is heard only while it has something to stop. */
  private listening: AbortController | null = null
  private done = deferred<ValueAnimation>()

  constructor(
    private readonly track: Track,
    private readonly write: (value: number) => void,
    private readonly timing: ValueTiming,
    private readonly signal?: AbortSignal,
  ) {}

  /** As WAAPI's: once finished it stays resolved until the animation moves again. */
  get finished(): Promise<ValueAnimation> {
    return this.done.promise
  }

  get playState(): AnimationPlayState {
    return this.state
  }

  get currentTime(): number | null {
    return this.state === 'idle' ? null : this.time
  }

  /** As WAAPI's: idle or paused, it holds there; running or finished, it runs on from there. */
  set currentTime(ms: CSSNumberish | null) {
    this.time = Number(ms ?? 0)
    if (this.state === 'running' || this.state === 'finished') this.run()
    else this.holdHere()
  }

  /** The whole animation, delay and every iteration included. */
  get end(): number {
    const { delay, iterations, endDelay = 0 } = this.timing
    return delay + this.track.duration * iterations + endDelay
  }

  play(): void {
    if (this.signal?.aborted) return this.fail(abortError())
    if (this.state === 'running') return
    this.time = this.rewound()
    this.run()
  }

  pause(): void {
    if (this.state === 'idle') this.time = this.rewound()
    this.hold()
  }

  /** As WAAPI's: it plays backwards, even from paused; if it can't, nothing changes. */
  reverse(): void {
    this.playbackRate = -this.playbackRate
    try {
      this.play()
    } catch (error) {
      this.playbackRate = -this.playbackRate
      throw error
    }
  }

  finish(): void {
    this.checkFinishable()
    this.time = this.playbackRate < 0 ? 0 : this.end
    this.render()
    this.complete()
  }

  cancel(): void {
    this.stop()
    this.write(this.track.valueAt(0))
  }

  /** How fast the value moves now, in units per second (0 when it isn't). */
  get velocity(): number {
    const local = this.time - this.timing.delay
    if (this.state !== 'running' || local < 0) return 0
    const within = this.iterationTime(local)
    const sign = this.backwardsAt(local) ? -1 : 1
    return sign * this.playbackRate * this.track.velocityAt(within)
  }

  /** As WAAPI: there is no end to jump to standing still or going forever. */
  private checkFinishable(): void {
    if (this.playbackRate === 0) {
      throw invalidState(
        'theater: an animation at playbackRate 0 cannot finish',
      )
    }
    if (this.playbackRate > 0 && this.end === Infinity) {
      throw invalidState('theater: an endless animation cannot finish')
    }
  }

  /**
   * WAAPI's auto-rewind: outside its run (or idle), playing starts over
   * from the end it plays from; inside, it goes on from where it is.
   */
  private rewound(): number {
    if (this.playbackRate < 0) return this.rewoundBackwards()
    const outside = this.state === 'idle' || this.time < 0
    return outside || this.time >= this.end ? 0 : this.time
  }

  private rewoundBackwards(): number {
    const outside = this.state === 'idle' || this.time <= 0
    if (!outside && this.time <= this.end) return this.time
    if (this.end === Infinity) {
      throw invalidState(
        'theater: an endless animation has no end to play back from',
      )
    }
    return this.end
  }

  private run(): void {
    this.renew()
    this.state = 'running'
    this.listen()
    this.loop()
    this.update()
  }

  private hold(): void {
    this.renew()
    this.state = 'paused'
    this.listen()
    this.halt()
  }

  private holdHere(): void {
    this.hold()
    this.render()
  }

  private complete(): void {
    this.state = 'finished'
    this.retire()
    this.done.resolve(this)
  }

  /** Stops where it is: the signal's abort (B.5b). */
  private stop(): void {
    if (this.state === 'idle') return
    this.fail(abortError())
  }

  /** Back to idle; as WAAPI's cancel, `finished` rejects and a new one waits for the next play. */
  private fail(reason: unknown): void {
    this.state = 'idle'
    this.retire()
    this.done.reject(reason)
    this.done = deferred()
  }

  /** WAAPI: leaving the finished state makes a new `finished`; until then it stays resolved. */
  private renew(): void {
    if (this.state === 'finished') this.done = deferred()
  }

  private retire(): void {
    this.halt()
    this.unlisten()
  }

  /** Heard while running or paused, so a finished or idle one leaves nothing on the signal. */
  private listen(): void {
    if (!this.signal || this.listening) return
    this.listening = new AbortController()
    const options = { once: true, signal: this.listening.signal }
    this.signal.addEventListener('abort', () => this.stop(), options)
  }

  private unlisten(): void {
    this.listening?.abort()
    this.listening = null
  }

  private loop(): void {
    this.halt()
    this.ticking = new AbortController()
    const tick = ({ delta }: { delta: number }) => this.tick(delta)
    frames().every('update', tick, { signal: this.ticking.signal })
  }

  private halt(): void {
    this.ticking?.abort()
    this.ticking = null
  }

  private tick(delta: number): void {
    const next = this.time + delta * this.playbackRate
    this.time = Math.min(Math.max(next, 0), this.end)
    this.update()
  }

  /** Writes where it is; at the end it plays toward, it is finished. */
  private update(): void {
    this.render()
    const past = this.playbackRate < 0 ? this.time <= 0 : this.time >= this.end
    if (past) this.complete()
  }

  /**
   * A write that throws ends the animation with that error: rethrown, so
   * the frame loop reports it once, and the job is already gone.
   */
  private render(): void {
    try {
      this.draw()
    } catch (error) {
      this.fail(error)
      throw error
    }
  }

  private draw(): void {
    const local = this.time - this.timing.delay
    if (local < 0) return
    this.write(this.track.valueAt(this.iterationTime(local)))
  }

  private backwardsAt(local: number): boolean {
    if (this.track.duration === 0) return false
    return this.backwards(this.iterationOf(local))
  }

  /** The time inside the current iteration, direction applied. */
  private iterationTime(local: number): number {
    const { duration } = this.track
    if (duration === 0) return 0
    const clamped = Math.min(local, duration * this.timing.iterations)
    const iteration = this.iterationOf(local)
    const within = clamped - iteration * duration
    return this.backwards(iteration) ? duration - within : within
  }

  /** Which iteration `local` is in; past the end, the last one. */
  private iterationOf(local: number): number {
    const { duration } = this.track
    const clamped = Math.min(local, duration * this.timing.iterations)
    const iteration = Math.floor(clamped / duration)
    return Math.min(iteration, this.timing.iterations - 1)
  }

  private backwards(iteration: number): boolean {
    const { direction } = this.timing
    const odd = iteration % 2 === 1
    if (direction === 'reverse') return true
    if (direction === 'alternate') return odd
    return direction === 'alternate-reverse' && !odd
  }
}

function invalidState(message: string): DOMException {
  return new DOMException(message, 'InvalidStateError')
}

/**
 * Whether `animate`'s arguments ask for a value: numbers, and somewhere to
 * write them. Decided by both, so an empty list of elements stays a list.
 */
export function isValueCall(
  first: unknown,
  second: unknown,
): first is number[] {
  const numbers =
    Array.isArray(first) && first.every((v) => typeof v === 'number')
  return numbers && isValueTarget(second)
}

/**
 * Where a sequence puts a value (B.2): when it starts and how long it
 * holds after its end, both in ms after speed.
 */
export interface ValuePlace {
  delay: number
  endDelay: number
}

/**
 * A value's track from theater's options (B.1, B.3b): keyframes along the
 * curve, or a fling from the first one; time divided by `speed` (C.1b).
 * The one builder for `animate` and a sequence's value parts.
 *
 *   valueTrack([0, 1200], { duration: 800 }, speedOf(document.documentElement))
 */
export function valueTrack(
  keyframes: number[],
  options: AnimateOptions,
  speed: number,
): Track {
  checkKeyframes(keyframes, options)
  checkNoComposite(options)
  if (!options.inertia)
    return new KeyframeTrack(keyframes, curveOf(options, speed))
  return atSpeedTrack(new InertiaPath(keyframes[0]!, options.inertia), speed)
}

function checkKeyframes(keyframes: number[], options: AnimateOptions): void {
  if (keyframes.length >= (options.inertia ? 1 : 2)) return
  throw new RangeError(
    'theater: animating a value needs at least two keyframes (or inertia and a start)',
  )
}

function checkNoComposite(options: AnimateOptions): void {
  if (options.composite === undefined) return
  throw new TypeError(
    'theater: composite is for elements; a value has nothing under it to add to',
  )
}

function atSpeedTrack(track: Track, speed: number): Track {
  if (speed === 1) return track
  return {
    duration: track.duration / speed,
    valueAt: (ms) => track.valueAt(ms * speed),
    velocityAt: (ms) => track.velocityAt(ms * speed) * speed,
  }
}

/**
 * Starts a value on `track` with theater's options (B.1, C.1): now, or at
 * its `place` in a sequence. Reduced motion leaves it alone unless
 * `reduce: 'jump'`, which ends it at once.
 *
 *   startValue(valueTrack([0, 100], options, 1), write, options, 1)
 */
export function startValue(
  track: Track,
  write: (value: number) => void,
  options: AnimateOptions,
  speed: number,
  place?: ValuePlace,
): ValueAnimation {
  const jumps = reducedMotion() && options.reduce === 'jump'
  const timing = valueTiming(options, speed, place)
  if (jumps) timing.iterations = 1 // as an element's: a jump is one 0 ms run, so even an endless one ends
  const animation = new ValueAnimation(track, write, timing, options.signal)
  if (jumps) animation.finish()
  else animation.play()
  return animation
}

/** WAAPI's timing for a value, checked; time divided by the page's speed (C.1b). */
function valueTiming(
  options: AnimateOptions,
  speed: number,
  place?: ValuePlace,
): ValueTiming {
  return {
    delay: place?.delay ?? delayOf(options) / speed,
    endDelay: place?.endDelay ?? 0,
    iterations: iterationsOf(options),
    direction: options.direction ?? 'normal',
  }
}
