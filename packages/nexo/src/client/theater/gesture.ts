/** What drag and pinch share: how far past a limit they follow, and their one motion at a time. */

/** Past a limit it follows at this share of the pointer (Motion's). */
const ELASTIC = 0.35

/** `elastic`, checked: from 0 (stops at the limit) to 1 (free). `owner` names the piece. */
export function elasticOf(elastic: number | undefined, owner: string): number {
  const share = elastic ?? ELASTIC
  if (share >= 0 && share <= 1) return share
  throw new RangeError(
    `theater: ${owner}'s elastic goes from 0 (stops) to 1 (free), got ${share}`,
  )
}

/**
 * The motion a gesture runs after it (a release, a `set`): one at a time,
 * so a new press or a new `set` stops the one running.
 */
export class GestureMotion {
  private motion = new AbortController()

  constructor(private readonly gesture?: AbortSignal) {}

  /** Stops the running motion; the next one listens to a fresh `signal`. */
  restart(): void {
    this.motion.abort()
    this.motion = new AbortController()
  }

  /** The running motion's signal, which the gesture's own signal ends too. */
  get signal(): AbortSignal {
    const own = this.motion.signal
    return this.gesture ? AbortSignal.any([this.gesture, own]) : own
  }
}
