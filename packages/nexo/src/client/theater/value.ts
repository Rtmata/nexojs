import type { Curve } from '../../shared/theater/curve'
import { frames } from './frame'
import { abortError, Deferred, type Playback } from './playback'

/** Where a value is at a moment of one iteration, and how long one lasts. */
export interface Track {
  readonly duration: number
  valueAt(ms: number): number
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

  valueAt(ms: number): number {
    const gaps = this.keyframes.length - 1
    const place = this.curve.at(ms) * gaps
    const i = Math.min(Math.max(Math.floor(place), 0), gaps - 1)
    const [from, to] = [this.keyframes[i]!, this.keyframes[i + 1]!]
    return from + (to - from) * (place - i)
  }
}

/** WAAPI's timing, for values. */
export interface ValueTiming {
  delay: number
  iterations: number
  direction: PlaybackDirection
}

/**
 * A value animated on theater's frame loop (A.2), shaped as WAAPI's
 * `Animation` (B.1). Each frame it writes where the track is. `finish()`
 * writes the end, `cancel()` writes the start (WAAPI: the effect goes
 * away); aborting the signal stops it where it is (B.5b). `finished`
 * rejects with an AbortError on both, as WAAPI's does.
 */
export class ValueAnimation implements Playback {
  playbackRate = 1
  private time = 0
  private state: AnimationPlayState = 'idle'
  private running: AbortController | null = null
  private done = new Deferred<ValueAnimation>()

  constructor(
    private readonly track: Track,
    private readonly write: (value: number) => void,
    private readonly timing: ValueTiming,
    private readonly signal?: AbortSignal,
  ) {
    signal?.addEventListener('abort', () => this.stop(), { once: true })
  }

  get finished(): Promise<ValueAnimation> {
    return this.done.promise
  }

  get playState(): AnimationPlayState {
    return this.state
  }

  get currentTime(): number | null {
    return this.state === 'idle' ? null : this.time
  }

  set currentTime(ms: CSSNumberish | null) {
    this.time = Number(ms ?? 0)
    if (this.state === 'idle') this.state = 'paused'
    this.render()
  }

  /** The whole animation, delay and every iteration included. */
  get end(): number {
    return this.timing.delay + this.track.duration * this.timing.iterations
  }

  play(): void {
    if (this.signal?.aborted) return this.done.reject(abortError())
    if (this.state === 'running') return
    if (this.state !== 'paused')
      this.time = this.playbackRate < 0 ? this.end : 0
    this.state = 'running'
    this.render()
    this.loop()
  }

  pause(): void {
    if (this.state === 'idle') this.time = 0
    this.state = 'paused'
    this.halt()
  }

  reverse(): void {
    this.playbackRate = -this.playbackRate
    if (this.state !== 'paused') this.play()
  }

  /** As WAAPI: an endless animation has no end to jump to. */
  finish(): void {
    if (this.end === Infinity && this.playbackRate > 0) {
      throw new DOMException(
        'theater: an endless animation cannot finish',
        'InvalidStateError',
      )
    }
    this.time = this.playbackRate < 0 ? 0 : this.end
    this.render()
    this.complete()
  }

  cancel(): void {
    this.write(this.track.valueAt(0))
    this.stop()
  }

  /** Stops where it is: the signal's abort (B.5b). */
  private stop(): void {
    if (this.state === 'idle') return
    this.state = 'idle'
    this.halt()
    this.done.reject(abortError())
    this.done = new Deferred()
  }

  private complete(): void {
    this.state = 'finished'
    this.halt()
    this.done.resolve(this)
    this.done = new Deferred()
  }

  private loop(): void {
    this.running = new AbortController()
    const tick = ({ delta }: { delta: number }) => this.tick(delta)
    frames().every('update', tick, { signal: this.running.signal })
  }

  private halt(): void {
    this.running?.abort()
    this.running = null
  }

  private tick(delta: number): void {
    this.time += delta * this.playbackRate
    const past = this.playbackRate < 0 ? this.time <= 0 : this.time >= this.end
    if (past) this.finish()
    else this.render()
  }

  private render(): void {
    const local = this.time - this.timing.delay
    if (local < 0) return
    this.write(this.track.valueAt(this.iterationTime(local)))
  }

  /** The time inside the current iteration, direction applied. */
  private iterationTime(local: number): number {
    const { duration } = this.track
    if (duration === 0) return 0
    const total = duration * this.timing.iterations
    const clamped = Math.min(local, total)
    const iteration = Math.min(
      Math.floor(clamped / duration),
      this.timing.iterations - 1,
    )
    const within = clamped - iteration * duration
    return this.backwards(iteration) ? duration - within : within
  }

  private backwards(iteration: number): boolean {
    const { direction } = this.timing
    const odd = iteration % 2 === 1
    if (direction === 'reverse') return true
    if (direction === 'alternate') return odd
    return direction === 'alternate-reverse' && !odd
  }
}
