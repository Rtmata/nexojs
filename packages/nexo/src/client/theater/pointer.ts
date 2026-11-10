import { speed, type Sample } from '../../shared/theater/velocity'

/** What a track tells: each move, and its end (released, or cancelled by the browser). */
export interface TrackEvents {
  move(track: PointerTrack): void
  end(track: PointerTrack, released: boolean): void
}

function sample(event: PointerEvent): Sample {
  return { t: event.timeStamp, x: event.clientX, y: event.clientY }
}

/**
 * One pointer followed from its press (F.1): its samples, so its offset
 * and its real speed (least squares over the last 100 ms, `speed`). It is
 * followed on the document, not captured: a capture would take the click
 * from the links and buttons inside. `pointercancel` (the browser took
 * the pointer to scroll) ends it unreleased.
 */
export class PointerTrack {
  readonly samples: Sample[]
  private readonly done = new AbortController()

  constructor(
    start: PointerEvent,
    private readonly events: TrackEvents,
    signal: AbortSignal,
  ) {
    this.samples = [sample(start)]
    this.listen(start.pointerId, AbortSignal.any([signal, this.done.signal]))
  }

  private listen(pointer: number, signal: AbortSignal): void {
    const own = (e: PointerEvent) => e.pointerId === pointer
    const on = (name: string, run: (e: PointerEvent) => void) =>
      document.addEventListener(
        name,
        (e) => own(e as PointerEvent) && run(e as PointerEvent),
        { signal },
      )
    on('pointermove', (e) => this.moved(e))
    on('pointerup', (e) => this.ended(e, true))
    on('pointercancel', (e) => this.ended(e, false))
  }

  /** From the press to now, in px. */
  get offset(): { x: number; y: number } {
    const [first, last] = [this.samples[0]!, this.samples.at(-1)!]
    return { x: last.x - first.x, y: last.y - first.y }
  }

  /** Now, in px/s. */
  get velocity(): { x: number; y: number } {
    return { x: speed(this.samples, 'x'), y: speed(this.samples, 'y') }
  }

  private moved(event: PointerEvent): void {
    for (const e of event.getCoalescedEvents?.() ?? [event])
      this.samples.push(sample(e))
    this.events.move(this)
  }

  private ended(event: PointerEvent, released: boolean): void {
    if (released) this.samples.push(sample(event))
    this.done.abort()
    this.events.end(this, released)
  }
}
