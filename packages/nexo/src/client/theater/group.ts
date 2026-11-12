import type { Playback } from './playback'

/**
 * Several animations as one: a list of elements answers with the
 * same `Animation` shape. Commands go to every member. Queries ask them
 * all, since a `stagger` ends some before others: the group runs while
 * any member runs, and its time is the furthest a member got.
 *
 *   const all = animate(document.querySelectorAll('.cover'), …)
 *   all.pause()
 */
export class AnimationGroup implements Playback {
  readonly finished: Promise<AnimationGroup>

  constructor(readonly members: Playback[]) {
    const all = Promise.all(members.map((member) => member.finished))
    this.finished = all.then(() => this)
    this.finished.catch(() => {})
  }

  play(): void {
    for (const member of this.members) member.play()
  }

  pause(): void {
    for (const member of this.members) member.pause()
  }

  reverse(): void {
    for (const member of this.members) member.reverse()
  }

  finish(): void {
    for (const member of this.members) member.finish()
  }

  cancel(): void {
    for (const member of this.members) member.cancel()
  }

  get currentTime(): CSSNumberish | null {
    const times = this.members
      .map((m) => m.currentTime)
      .filter((t) => t !== null)
    return times.length === 0 ? null : Math.max(...times.map(Number))
  }

  set currentTime(ms: CSSNumberish | null) {
    for (const member of this.members) member.currentTime = ms
  }

  get playbackRate(): number {
    return this.members[0]?.playbackRate ?? 1
  }

  set playbackRate(rate: number) {
    for (const member of this.members) member.playbackRate = rate
  }

  /** The liveliest member's: running, else paused, else finished, else idle. */
  get playState(): AnimationPlayState {
    const states = new Set(this.members.map((m) => m.playState))
    return LIVELIEST.find((state) => states.has(state)) ?? 'finished'
  }
}

const LIVELIEST: readonly AnimationPlayState[] = [
  'running',
  'paused',
  'finished',
  'idle',
]
