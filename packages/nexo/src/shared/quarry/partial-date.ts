/** A year as a number, or a partial ISO date (`'1991'`, `'198'`, `'1991-05'`). */
export type Year = number | string

const PARTIAL_ISO = /^(\d{2,4})(?:-(\d{2})(?:-(\d{2}))?)?$/

/** The whole years a JavaScript `Date` can hold. */
const FIRST_YEAR = -271_820
const LAST_YEAR = 275_759

/**
 * A year or partial ISO date, read and checked once. A partial year is
 * padded with zeros (`'198'` → 1980) and `digits` says how much was known,
 * so nothing ever claims more precision than the data has. Impossible dates
 * (month 13, February 30) are refused instead of rolling over.
 *
 * Years count as ISO 8601, `Date` and `Intl` do: 0 is 1 BC, -1 is 2 BC.
 */
export class PartialDate {
  private constructor(
    readonly year: number,
    readonly digits: number,
    readonly month?: number,
    readonly day?: number,
  ) {}

  static of(value: Year): PartialDate {
    const date =
      typeof value === 'number'
        ? PartialDate.fromNumber(value)
        : PartialDate.fromText(value)
    date.ensurePossible(value)
    return date
  }

  /** The year, when it's known to the digit; throws for decades and centuries. */
  fullYear(value: Year, what: string): number {
    this.ensureFullYear(value, what)
    return this.year
  }

  /** Throws unless the year is known to the digit (`what` needs it). */
  ensureFullYear(value: Year, what: string): void {
    if (this.digits >= 4) return
    throw new Error(
      `quarry: "${value}" is too vague for ${what}. Give the whole year, like '1991'`,
    )
  }

  /** The first moment it could mean, in UTC. */
  toDate(): Date {
    return utcDate(this.year, (this.month ?? 1) - 1, this.day ?? 1)
  }

  /** Of the days it could mean, the one nearest `now` (`now` itself when inside). */
  nearestDay(now: Date): Date {
    const first = this.toDate()
    if (this.day !== undefined || first > now) return first
    const last = this.month
      ? utcDate(this.year, this.month, 0)
      : utcDate(this.year, 11, 31)
    return last < now ? last : now
  }

  private ensurePossible(value: Year): void {
    const { month, day } = this
    if (month !== undefined && (month < 1 || month > 12))
      throw impossible(value, `no month ${month}. Months go from 01 to 12`)
    if (day !== undefined && (day < 1 || day > daysIn(this.year, month!)))
      throw impossible(value, `no day ${day}. Check the day against its month`)
  }

  private static fromNumber(value: number): PartialDate {
    if (!Number.isInteger(value))
      throw new Error(
        `quarry: ${value} is not a year. Give a whole number, like 1991`,
      )
    return new PartialDate(value, 4)
  }

  private static fromText(value: string): PartialDate {
    const match = PARTIAL_ISO.exec(value)
    if (!match || (match[2] && match[1]!.length < 4)) throw notPartialIso(value)
    const [, year, month, day] = match
    const start = Number(year!.padEnd(4, '0'))
    return new PartialDate(start, year!.length, numeric(month), numeric(day))
  }
}

function notPartialIso(value: string): Error {
  return new Error(
    `quarry: "${value}" is not a partial ISO date. Write it as YYYY-MM-DD, YYYY-MM, YYYY, YYY (a decade) or YY (a century)`,
  )
}

function numeric(text: string | undefined): number | undefined {
  return text ? Number(text) : undefined
}

/**
 * A UTC date for any year a `Date` can hold. `Date.UTC` reads years 0–99 as
 * 1900–1999, so the year is set afterwards.
 */
export function utcDate(year: number, monthIndex: number, day: number): Date {
  if (year < FIRST_YEAR || year > LAST_YEAR) {
    throw new Error(
      `quarry: the year ${year} is past what dates can hold (${FIRST_YEAR} to ${LAST_YEAR}). Give a year in that range`,
    )
  }
  const date = new Date(0)
  date.setUTCFullYear(year, monthIndex, day)
  return date
}

function daysIn(year: number, month: number): number {
  return utcDate(year, month, 0).getUTCDate()
}

function impossible(value: Year, what: string): Error {
  return new Error(`quarry: "${value}" has ${what}`)
}
