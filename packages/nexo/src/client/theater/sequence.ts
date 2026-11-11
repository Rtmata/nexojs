import {
  curveOf,
  delayOf,
  iterationsOf,
  type AnimateOptions,
} from '../../shared/theater/options'
import {
  schedule,
  type Position,
  type Slot,
} from '../../shared/theater/schedule'
import { onAbortUntil } from '../settle/abort'
import { animateElement, settle } from './element'
import { AnimationGroup } from './group'
import type { Keyframes } from './keyframes'
import { writerOf, type Playback, type ValueTarget } from './playback'
import { speedOf } from './speed'
import { listOf, type Targets } from './targets'
import { isValueCall, startValue, valueTrack, type Track } from './value'

/** A segment's options: an animation's, plus where it goes (B.2b). */
export interface SegmentOptions extends AnimateOptions {
  /** Start with the previous segment (`'previous'`) or at a label. */
  with?: string
  /** An absolute time, in ms before speed (C.1b), as `delay` is. */
  at?: number
}

/** One part of a sequence: an element (or list), a value, or a whole sequence. */
export type Segment =
  | [Targets, Keyframes, SegmentOptions?]
  | [number[], ValueTarget<number>, SegmentOptions?]
  | [SequenceItem[], SegmentOptions?]

/** A segment, or a label: a plain string marking a moment (B.2b). */
export type SequenceItem = Segment | string

/** Options of a whole sequence. */
export interface SequenceOptions {
  /** Aborting stops every part where it is (B.5b). */
  signal?: AbortSignal
}

/**
 * A segment measured before it is placed (pattern: composite — a nested
 * sequence is a part too): how long it is, where it asks to go, and how
 * to make its animations once placed.
 */
interface Part {
  readonly length: number
  readonly position: Position
  /** Its animations, starting at `start` ms, every one ending at `total`. */
  create(start: number, total: number): Playback[]
}

/**
 * Where the segment asks to go; a numeric `delay` is a shift (B.2b). In
 * ms after speed, as lengths are, so the whole sequence keeps one time
 * (C.1b).
 */
function positionOf(options: SegmentOptions, speed: number): Position {
  const shift = typeof options.delay === 'number' ? delayOf(options) : 0
  const at = options.at === undefined ? undefined : options.at / speed
  return { with: options.with, at, delay: shift / speed }
}

/** Its own options: the position taken out, the sequence's signal in. */
function ownOptions(
  options: SegmentOptions,
  signal?: AbortSignal,
): AnimateOptions {
  const { with: _with, at: _at, delay, ...rest } = options
  const stagger = typeof delay === 'function' ? delay : 0
  return { ...rest, delay: stagger, signal }
}

/** How many times a segment runs: a finite number, for it to have an end. */
function iterationsIn(options: AnimateOptions): number {
  const iterations = iterationsOf(options)
  if (iterations !== Infinity) return iterations
  throw new RangeError(
    'theater: an endless segment has no end for a sequence to place',
  )
}

/** An element, or a list staggered inside the segment. */
class ElementsPart implements Part {
  readonly length: number
  private readonly offsets: number[]
  private readonly run: number

  constructor(
    private readonly list: Element[],
    private readonly keyframes: Keyframes,
    private readonly options: AnimateOptions,
    private readonly speed: number,
    readonly position: Position,
  ) {
    const count = list.length
    this.offsets = list.map((_, i) => delayOf(options, i, count) / speed)
    this.run = curveOf(options, speed).duration * iterationsIn(options)
    // The last one to end; an empty list takes no time.
    this.length = Math.max(0, ...this.offsets.map((at) => at + this.run))
  }

  create(start: number, total: number): Playback[] {
    return this.list.map((el, i) => {
      const delay = start + this.offsets[i]!
      const place = {
        delay,
        endDelay: total - delay - this.run,
        speed: this.speed,
      }
      return animateElement(el, this.keyframes, this.options, place)
    })
  }
}

/** A value on the frame loop, built and started as `animate` builds one. */
class ValuePart implements Part {
  readonly length: number
  private readonly track: Track

  constructor(
    keyframes: number[],
    private readonly target: ValueTarget<number>,
    private readonly options: AnimateOptions,
    private readonly speed: number,
    readonly position: Position,
  ) {
    this.track = valueTrack(keyframes, options, speed)
    this.length = this.track.duration * iterationsIn(options)
  }

  create(start: number, total: number): Playback[] {
    const place = { delay: start, endDelay: total - start - this.length }
    const write = writerOf(this.target)
    return [startValue(this.track, write, this.options, this.speed, place)]
  }
}

/** A whole sequence: its segments placed by `schedule` (B.2b). */
class SequencePart implements Part {
  readonly length: number
  private readonly parts: Part[]
  private readonly starts: number[]

  constructor(
    items: SequenceItem[],
    speed: number,
    signal: AbortSignal | undefined,
    readonly position: Position = {},
  ) {
    const planned = items.map((item) => slotOf(item, speed, signal))
    const { starts, end } = schedule(planned)
    this.parts = planned.filter((slot): slot is Part => 'create' in slot)
    this.starts = starts
    this.length = end
  }

  create(start: number, total: number): Playback[] {
    return this.parts.flatMap((part, i) =>
      part.create(start + this.starts[i]!, total),
    )
  }
}

/** A label, or a part measured by the shape of its first entry. */
function slotOf(
  item: SequenceItem,
  speed: number,
  signal?: AbortSignal,
): Slot & (Part | { label: string }) {
  if (typeof item === 'string') return { label: item }
  if (isSequence(item[0])) {
    const options = (item[1] ?? {}) as SegmentOptions
    return new SequencePart(item[0], speed, signal, positionOf(options, speed))
  }
  return partOf(item, speed, signal)
}

function partOf(segment: Segment, speed: number, signal?: AbortSignal): Part {
  const options = (segment[2] ?? {}) as SegmentOptions
  const own = ownOptions(options, signal)
  const position = positionOf(options, speed)
  if (isValueCall(segment[0], segment[1])) {
    const target = segment[1] as ValueTarget<number>
    return new ValuePart(segment[0], target, own, speed, position)
  }
  const list = listOf(segment[0] as Targets)
  return new ElementsPart(list, segment[1] as Keyframes, own, speed, position)
}

/** A sequence: a list of segments (arrays) and labels (strings). */
export function isSequence(value: unknown): value is SequenceItem[] {
  if (!Array.isArray(value) || value.length === 0) return false
  return value.every((item) => typeof item === 'string' || Array.isArray(item))
}

/**
 * A sequence playing as one `Animation` (B.2): `pause`, `reverse`,
 * `currentTime` and `playbackRate` act on all of it. Every part ends at
 * the sequence's end; then — or when the signal aborts — what is seen is
 * written inline and the element parts are retired (B.5b).
 */
export class Sequence extends AnimationGroup {
  constructor(
    members: Playback[],
    readonly duration: number,
    signal?: AbortSignal,
  ) {
    super(members)
    const retire = () => this.retire()
    this.finished.then(retire, () => {})
    // Until every part settles: `finished` rejects as soon as one part is
    // cancelled, and an abort after that must still settle the others.
    const settled = Promise.allSettled(members.map((m) => m.finished))
    if (signal?.aborted) retire()
    else onAbortUntil(signal, retire, settled)
  }

  private retire(): void {
    for (const member of this.members) {
      if (member instanceof Animation) settleReporting(member)
    }
  }
}

/** One part that can't be settled is reported; the others still are. */
function settleReporting(animation: Animation): void {
  try {
    settle(animation)
  } catch (error) {
    reportError(error)
  }
}

/**
 * Plays segments as one (B.2, B.2b): with no position a segment goes after
 * the previous one; `with: 'previous'` or `with: <label>` starts it there;
 * a number `delay` shifts it; `at` is absolute. A string is a label. The
 * whole sequence reads its speed from `<html>` (C.1b).
 *
 *   animate([
 *     [title, { opacity: [0, 1] }],
 *     [shelves, { translate: ['0 40px', '0 0'] }, { with: 'previous', delay: 200 }],
 *     [[0, 1200], show, { delay: -100 }],
 *   ])
 */
export function animateSequence(
  items: SequenceItem[],
  options: SequenceOptions = {},
): Sequence {
  const speed = speedOf(document.documentElement)
  const whole = new SequencePart(items, speed, options.signal)
  return new Sequence(
    whole.create(0, whole.length),
    whole.length,
    options.signal,
  )
}
