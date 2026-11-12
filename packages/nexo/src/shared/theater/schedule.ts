/** Where a segment goes in a sequence. */
export interface Position {
  /** Start together with the previous segment, or at a label. */
  with?: string
  /** Shift from its place, in ms; negative is earlier. */
  delay?: number
  /** An absolute time, in ms. */
  at?: number
}

/** A label, or a segment of some length at some position. */
export type Slot = { label: string } | { length: number; position: Position }

/** When each segment starts, and when the whole sequence ends. */
export interface Timetable {
  starts: number[]
  end: number
}

/**
 * Places a sequence's segments: with no position a segment goes
 * after the previous one ends; `with: 'previous'` starts it with the
 * previous one, `with: <label>` at a label; `delay` shifts it from there;
 * `at` is an absolute time. A label marks where the previous segment
 * ended. Nothing starts before 0.
 *
 *   schedule([{ length: 300, position: {} }, { length: 400, position: { with: 'previous', delay: 200 } }])
 *   // starts [0, 200], end 600
 */
export function schedule(slots: Slot[]): Timetable {
  const placer = new Placer()
  for (const slot of slots) {
    if ('label' in slot) placer.mark(slot.label)
    else placer.place(slot.length, slot.position)
  }
  return { starts: placer.starts, end: placer.end }
}

/** Walks the slots once, remembering the previous segment and the labels. */
class Placer {
  readonly starts: number[] = []
  end = 0
  private previous = { start: 0, end: 0 }
  private readonly labels = new Map<string, number>()

  mark(label: string): void {
    if (label === 'previous') {
      throw new RangeError(
        'theater: "previous" is not a label name: it means the segment before',
      )
    }
    this.labels.set(label, this.previous.end)
  }

  place(length: number, position: Position): void {
    const start = Math.max(0, this.baseOf(position) + (position.delay ?? 0))
    this.starts.push(start)
    this.previous = { start, end: start + length }
    this.end = Math.max(this.end, start + length)
  }

  private baseOf(position: Position): number {
    if (position.at !== undefined) return position.at
    if (position.with === undefined) return this.previous.end
    if (position.with === 'previous') return this.previous.start
    return this.labelAt(position.with)
  }

  private labelAt(label: string): number {
    const at = this.labels.get(label)
    if (at !== undefined) return at
    const known = [...this.labels.keys()].join(', ') || 'none yet'
    throw new RangeError(
      `theater: no label "${label}" before this segment (labels: ${known})`,
    )
  }
}
