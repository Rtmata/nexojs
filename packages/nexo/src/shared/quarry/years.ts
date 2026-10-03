import type { Formats } from './formats'
import type { Numbers } from './numbers'
import { PartialDate, utcDate, type Year } from './partial-date'
import type { Words } from './words'

export interface CalendarOptions {
  /**
   * The calendar to write in: `'gregory'` by default, as the data is
   * Gregorian. Ask for the language's own (`'persian'`, `'islamic'`…) to
   * accept that its years and months don't line up exactly with the data.
   */
  calendar?: string
}

export interface PartialDateOptions extends CalendarOptions {
  /** How months are written: `'long'` (default) or `'short'`. */
  month?: 'long' | 'short'
}

/** Dates and years, never claiming more precision than the data has. */
export class Years {
  constructor(
    private readonly formats: Formats,
    private readonly words: Words,
    private readonly numbers: Numbers,
  ) {}

  /** `1991-05-22` → full date, `1991-05` → month, `1991` → year, `198` → decade, `19` → century. */
  partialDate(value: string | null, options: PartialDateOptions = {}): string {
    if (!value) return ''
    const date = PartialDate.of(value)
    if (date.digits === 2) return this.centuryOf(date, value)
    if (date.digits === 3) return this.decadeOf(date, value, {})
    // A bare year goes through Intl too, so its calendar matches full dates.
    const style = { year: 'numeric', ...monthAndDay(date, options) } as const
    const written = { ...style, ...eraFor(date.year), ...calendarOf(options) }
    return this.formats.date(written).format(date.toDate())
  }

  decade(value: Year, options: { short?: boolean } = {}): string {
    return this.decadeOf(PartialDate.of(value), value, options)
  }

  /** The common reading: the 1900s are the 20th century; '00' is the 1st. */
  century(value: Year): string {
    return this.centuryOf(PartialDate.of(value), value)
  }

  private decadeOf(
    date: PartialDate,
    value: Year,
    options: { short?: boolean },
  ) {
    const { year, digits } = date
    if (digits < 3)
      throw new Error(
        `quarry: "${value}" is too vague for a decade. Give at least three digits, like '198'`,
      )
    if (year < 0)
      throw new Error(
        `quarry: decades before the year 0 aren't supported (${value}). Write the years themselves instead`,
      )
    return this.words.decade(Math.floor(year / 10) * 10, options.short ?? false)
  }

  private centuryOf(date: PartialDate, value: Year): string {
    const { year, digits } = date
    // '00' is the years 0–99, the 1st century; the single year 0 is 1 BC.
    if (year < 0 || (year === 0 && digits === 4))
      throw new Error(
        `quarry: centuries before AD 1 aren't supported (${value}). Write the years themselves instead`,
      )
    const n = Math.floor(year / 100) + 1
    return this.words.century(n, {
      roman: () => romanCentury(this.numbers, n),
      ordinal: () => this.numbers.ordinal(n),
    })
  }

  yearRange(from: Year, to: Year, options: CalendarOptions = {}): string {
    const start = PartialDate.of(from).fullYear(from, 'a year range')
    const end = PartialDate.of(to).fullYear(to, 'a year range')
    if (start > end)
      throw new Error(
        `quarry: the year range ${start}–${end} goes backwards. Give the earlier year first`,
      )
    return this.formats
      .date({ year: 'numeric', ...eraFor(start), ...calendarOf(options) })
      .formatRange(utcDate(start, 0, 1), utcDate(end, 0, 1))
  }

  /**
   * How long ago, in whole years. A bare year says "this year" / "last
   * year" (calendar years); with a month known, years are counted from the
   * day nearest now it could mean, so they're never overstated.
   */
  ago(value: Year, now = new Date()): string {
    const date = PartialDate.of(value)
    date.ensureFullYear(value, 'saying how long ago it was')
    const then = date.nearestDay(now)
    const years = wholeYears(then, now, date.month !== undefined)
    // -0 reads as past; a date ahead of now is always future.
    const signed = then > now ? Math.abs(years) : -years
    return this.formats
      .relative(date.month ? 'always' : 'auto')
      .format(signed, 'year')
  }
}

/** How much of the month and day to write: only what the date knows. */
function monthAndDay(
  date: PartialDate,
  options: PartialDateOptions,
): Intl.DateTimeFormatOptions {
  if (!date.month) return {}
  const month = options.month ?? 'long'
  return date.day ? { month, day: 'numeric' } : { month }
}

/** Roman numerals stop at 3999: past that, a century can't be written so. */
function romanCentury(numbers: Numbers, n: number): string {
  if (n <= 3999) return numbers.roman(n)
  throw new Error(
    `quarry: the ${n}th century is past what roman numerals can write (up to 3999). Write the year itself instead`,
  )
}

/** Years before AD 1 say their era ('1 BC'): a bare '1' would mean AD 1. */
function eraFor(year: number): Intl.DateTimeFormatOptions {
  return year < 1 ? { era: 'short' } : {}
}

/** Only the calendar option, when given: `undefined` would override Formats' default. */
function calendarOf(options: CalendarOptions): Intl.DateTimeFormatOptions {
  return options.calendar ? { calendar: options.calendar } : {}
}

/** Years between, counting only full ones when the month is known. */
function wholeYears(then: Date, now: Date, exact: boolean): number {
  const years = now.getUTCFullYear() - then.getUTCFullYear()
  if (!exact) return years
  const anniversary = new Date(then)
  anniversary.setUTCFullYear(now.getUTCFullYear())
  if (then <= now && anniversary > now) return years - 1
  return then > now && anniversary < now ? years + 1 : years
}
