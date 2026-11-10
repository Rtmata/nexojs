import type { Playback } from './playback'

/**
 * Several animations as one (B.1): a list of elements answers with the
 * same `Animation` shape. Commands go to every member; queries read the
 * first (they all started together, with the same timing).
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
    return this.members[0]?.currentTime ?? null
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

  get playState(): AnimationPlayState {
    return this.members[0]?.playState ?? 'finished'
  }
}
