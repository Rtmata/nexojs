import type { Formats } from './formats'
import { utcDate } from './partial-date'

export type NameStyle = 'long' | 'short' | 'narrow'

export interface NameOptions {
  /** How much of the name to write: `'long'` (default), `'short'`, `'narrow'`. */
  style?: NameStyle
}

export interface WeekdayName {
  /** ISO weekday: 1 is Monday, 7 is Sunday. */
  day: number
  name: string
}

/** Used when the engine can't say which day a language's week starts on. */
const MONDAY = 1

/** Months and weekdays by number. Any fixed year works: only the name is read. */
export class CalendarNames {
  constructor(private readonly formats: Formats) {}

  /** `9` → `'septiembre'`; `{ style: 'short' }` → `'sept'`. From 1 to 12. */
  month(month: number, options: NameOptions = {}): string {
    ensureBetween(month, 12, 'month')
    return this.formats
      .date({ month: options.style ?? 'long' })
      .format(utcDate(2024, month - 1, 1))
  }

  /** `7` → `'domingo'`; `{ style: 'short' }` → `'dom'`. ISO: 1 is Monday, 7 Sunday. */
  weekday(day: number, options: NameOptions = {}): string {
    ensureBetween(day, 7, 'weekday')
    return this.formats
      .date({ weekday: options.style ?? 'long' })
      .format(utcDate(2024, 0, day)) // 1 January 2024 is a Monday
  }

  /** The twelve months, in order. */
  months(options?: NameOptions): string[] {
    return Array.from({ length: 12 }, (_, i) => this.month(i + 1, options))
  }

  /** The seven days, from the one the language's week starts on. */
  weekdays(options?: NameOptions): WeekdayName[] {
    const first = this.firstDay()
    return Array.from({ length: 7 }, (_, i) => {
      const day = ((first - 1 + i) % 7) + 1
      return { day, name: this.weekday(day, options) }
    })
  }

  private firstDay(): number {
    const week = new Intl.Locale(this.formats.lang).getWeekInfo?.()
    return week?.firstDay ?? MONDAY
  }
}

function ensureBetween(value: number, last: number, what: string): void {
  if (Number.isInteger(value) && value >= 1 && value <= last) return
  throw new Error(
    `quarry: there's no ${what} ${value}. They go from 1 to ${last}`,
  )
}
