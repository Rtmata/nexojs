import type { Formats } from './formats'

/** Only units of a fixed length: months and years can't be split into hours. */
export type Duration = Partial<Record<DurationUnit, number>>
export type DurationUnit =
  'days' | 'hours' | 'minutes' | 'seconds' | 'milliseconds'

export interface DurationOptions extends Intl.DurationFormatOptions {
  /** How many units to show, from the largest: `{ units: 1 }` → `'3 h'`. */
  units?: number
}

/** From largest to smallest, with their length in milliseconds. */
const UNITS: readonly [DurationUnit, number][] = [
  ['days', 86_400_000],
  ['hours', 3_600_000],
  ['minutes', 60_000],
  ['seconds', 1_000],
  ['milliseconds', 1],
]

/** Lengths of time, split into units and rounded to the smallest one shown. */
export class Durations {
  constructor(private readonly formats: Formats) {}

  /** `{ minutes: 190 }` → `'3 h y 10 min'`; `{ minutes: 12.4 }` → `'12 min'`. */
  duration(duration: Duration, options: DurationOptions = {}): string {
    const { units = Infinity, ...shown } = options
    ensureUnits(units)
    const finest = finestIndex(duration)
    const total = totalOf(duration)
    const last = lastShown(total, finest, units)
    const parts = split(total, last)
    return Object.keys(parts).length > 0
      ? this.formats.duration(shown).format(parts)
      : this.none(UNITS[last]![0], shown)
  }

  /** `Intl` writes nothing for an all-zero duration unless told to show a unit. */
  private none(unit: DurationUnit, shown: Intl.DurationFormatOptions): string {
    const always = { ...shown, [`${unit}Display`]: 'always' }
    return this.formats.duration(always).format({ [unit]: 0 })
  }
}

function finestIndex(duration: Duration): number {
  const given = UNITS.map(([unit]) => duration[unit] !== undefined)
  const index = given.lastIndexOf(true)
  if (index >= 0) return index
  throw new Error(
    `quarry: a duration needs at least one unit, like { minutes: 90 }. Units go from days to milliseconds`,
  )
}

function totalOf(duration: Duration): number {
  return UNITS.reduce((sum, [unit, length]) => {
    const amount = duration[unit] ?? 0
    ensureLength(amount, unit)
    return sum + amount * length
  }, 0)
}

function ensureLength(amount: number, unit: DurationUnit): void {
  if (Number.isFinite(amount) && amount >= 0) return
  throw new Error(
    `quarry: ${amount} ${unit} is not a length of time. Give zero or more`,
  )
}

/** How many units to show: a whole number, one or more (left out, all of them). */
function ensureUnits(units: number): void {
  if (units === Infinity || (Number.isInteger(units) && units >= 1)) return
  throw new Error(
    `quarry: units ${units} can't say how many units to show. Give a whole number, 1 or more`,
  )
}

/** The smallest unit shown: `units` counted from the largest one in use. */
function lastShown(total: number, finest: number, units: number): number {
  const rounded = roundTo(total, finest)
  const first = UNITS.findIndex(([, length]) => rounded >= length)
  return first < 0 ? finest : Math.min(first + units - 1, finest)
}

function roundTo(total: number, index: number): number {
  const length = UNITS[index]![1]
  return Math.round(total / length) * length
}

/** Whole amounts per unit down to `last`, leaving out the empty ones. */
function split(total: number, last: number): Duration {
  let rest = roundTo(total, last)
  const parts: Duration = {}
  for (const [unit, length] of UNITS.slice(0, last + 1)) {
    const amount = Math.floor(rest / length)
    if (amount > 0) parts[unit] = amount
    rest -= amount * length
  }
  return parts
}
