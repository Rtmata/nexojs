import type { Formats } from './formats'

export type RelativeUnit =
  'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year'

export interface RelativeOptions extends Intl.RelativeTimeFormatOptions {
  /** The units it may use. By default, from minutes to years. */
  units?: readonly RelativeUnit[]
  /** The moment it's counted from. By default, right now. */
  now?: Date
  /** Where calendar days are counted. By default, the reader's time zone. */
  timeZone?: string
}

const DEFAULT_UNITS: readonly RelativeUnit[] = [
  'minute',
  'hour',
  'day',
  'week',
  'month',
  'year',
]
/** From largest to smallest, so the first one that fits wins. */
const LADDER: readonly RelativeUnit[] = [
  'year',
  'month',
  'week',
  'day',
  'hour',
  'minute',
  'second',
]
const ELAPSED: Partial<Record<RelativeUnit, number>> = {
  hour: 3_600_000,
  minute: 60_000,
  second: 1_000,
}
const DAY = 86_400_000

/** A date as it reads on a calendar somewhere, to count days and months. */
interface CalendarDay {
  year: number
  month: number
  day: number
}

/** Exact moments (a `Date`), written for the reader's clock and calendar. */
export class Moments {
  constructor(private readonly formats: Formats) {}

  /**
   * The day of a moment, in the reader's time zone by default. Fields add to
   * the full date (`{ month: 'short' }`, `{ hour: 'numeric' }`); `dateStyle`
   * and `timeStyle` go to `Intl` alone, as it doesn't allow mixing them.
   */
  date(moment: Date, options: Intl.DateTimeFormatOptions = {}): string {
    ensureMoment(moment)
    return this.formats.instant(withFullDate(options)).format(moment)
  }

  /**
   * How far from now: time elapsed under a day (`'hace 10 horas'`), calendar
   * days from there on, so 34 hours across two midnights isn't "yesterday".
   */
  relative(moment: Date, options: RelativeOptions = {}): string {
    ensureMoment(moment)
    const { units, now, timeZone, ...shown } = options
    const calendar = this.calendarIn(timeZone)
    const distance = new Distance(moment, now ?? new Date(), calendar)
    const [count, unit] = distance.in(ensureUnits(units ?? DEFAULT_UNITS))
    const format = this.formats.relative({ numeric: 'auto', ...shown })
    return format.format(count, unit)
  }

  private calendarIn(timeZone?: string): (moment: Date) => CalendarDay {
    const format = this.formats.calendarDay(timeZone)
    return (moment) => calendarDay(format.formatToParts(moment))
  }
}

/**
 * The distance between two moments, in whichever unit fits. Counts are cut
 * towards zero, as `ago` does for years: never overstated.
 */
class Distance {
  private readonly elapsed: number
  private readonly from: CalendarDay
  private readonly to: CalendarDay

  constructor(
    moment: Date,
    now: Date,
    calendar: (moment: Date) => CalendarDay,
  ) {
    this.elapsed = moment.getTime() - now.getTime()
    this.from = calendar(now)
    this.to = calendar(moment)
  }

  /** The largest of `units` it reaches; a zero of the smallest when it reaches none. */
  in(units: readonly RelativeUnit[]): [number, RelativeUnit] {
    const usable = this.usable(units)
    const ordered = LADDER.filter((unit) => usable.includes(unit))
    const unit =
      ordered.find((each) => this.count(each) !== 0) ?? ordered.at(-1)!
    return [this.count(unit) + 0, unit]
  }

  /** Under a day, calendar units step aside when a unit of elapsed time can answer. */
  private usable(units: readonly RelativeUnit[]): readonly RelativeUnit[] {
    if (Math.abs(this.elapsed) >= DAY) return units
    const clock = units.filter((unit) => ELAPSED[unit] !== undefined)
    return clock.length > 0 ? clock : units
  }

  private count(unit: RelativeUnit): number {
    const length = ELAPSED[unit]
    if (length !== undefined) return Math.trunc(this.elapsed / length)
    if (unit === 'day') return this.days()
    if (unit === 'week') return Math.trunc(this.days() / 7)
    return unit === 'month' ? this.months() : Math.trunc(this.months() / 12)
  }

  private days(): number {
    return (dayNumber(this.to) - dayNumber(this.from)) / DAY
  }

  private months(): number {
    return this.elapsed < 0
      ? -wholeMonths(this.to, this.from)
      : wholeMonths(this.from, this.to)
  }
}

/** Whole months from an earlier day to a later one. */
function wholeMonths(earlier: CalendarDay, later: CalendarDay): number {
  const months = (later.year - earlier.year) * 12 + later.month - earlier.month
  return later.day < earlier.day ? Math.max(months - 1, 0) : months
}

function dayNumber({ year, month, day }: CalendarDay): number {
  return Date.UTC(year, month - 1, day)
}

function calendarDay(parts: Intl.DateTimeFormatPart[]): CalendarDay {
  const part = (type: string) =>
    Number(parts.find((each) => each.type === type)!.value)
  return { year: part('year'), month: part('month'), day: part('day') }
}

function withFullDate(
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormatOptions {
  if (options.dateStyle || options.timeStyle) return options
  return { year: 'numeric', month: 'long', day: 'numeric', ...options }
}

function ensureMoment(moment: Date): void {
  if (!Number.isNaN(moment.getTime())) return
  throw new Error(
    `quarry: that Date is invalid. Check the text it was built from; a SQLite time needs its 'Z' to read as UTC`,
  )
}

function ensureUnits(units: readonly RelativeUnit[]): readonly RelativeUnit[] {
  if (units.length > 0) return units
  throw new Error(`quarry: relative() needs at least one unit, like ['day']`)
}
