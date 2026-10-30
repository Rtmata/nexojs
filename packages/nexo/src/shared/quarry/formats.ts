import { BoundedCache } from '../cache/bounded-cache'

/**
 * The `Intl` formatters one language needs, each built once per set of
 * options and kept: building one loads locale data, so it's the slow part.
 */
export class Formats {
  /** Bounded: options may be built per call, so their variety has no end. */
  private readonly cache = new BoundedCache<string, unknown>(64)

  constructor(readonly lang: string) {}

  number(options: Intl.NumberFormatOptions = {}): Intl.NumberFormat {
    return this.once(
      ['number', options],
      () => new Intl.NumberFormat(this.lang, options),
    )
  }

  list(options: Intl.ListFormatOptions = {}): Intl.ListFormat {
    const all = { type: 'conjunction' as const, ...options }
    return this.once(['list', all], () => new Intl.ListFormat(this.lang, all))
  }

  plurals(type: Intl.PluralRuleType = 'cardinal'): Intl.PluralRules {
    return this.once(
      ['plurals', type],
      () => new Intl.PluralRules(this.lang, { type }),
    )
  }

  /**
   * Dates are read in UTC, so the server's time zone never shifts the day,
   * and written in the Gregorian calendar unless `options.calendar` says
   * otherwise: the data is Gregorian, and another calendar's year or month
   * rarely lines up with it.
   */
  date(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
    const all = { timeZone: 'UTC', calendar: 'gregory', ...options }
    return this.once(
      ['date', all],
      () => new Intl.DateTimeFormat(this.lang, all),
    )
  }

  /**
   * For exact moments: unlike `date`, nothing is assumed, so they read in the
   * reader's time zone and the language's own calendar unless options say so.
   */
  instant(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
    return this.once(
      ['instant', options],
      () => new Intl.DateTimeFormat(this.lang, options),
    )
  }

  /** Numeric year, month and day in a time zone, to count on a calendar. */
  calendarDay(timeZone?: string): Intl.DateTimeFormat {
    const all = {
      timeZone,
      calendar: 'gregory',
      numberingSystem: 'latn',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    } as const
    return this.once(['day', all], () => new Intl.DateTimeFormat('en', all))
  }

  relative(options: Intl.RelativeTimeFormatOptions): Intl.RelativeTimeFormat {
    return this.once(
      ['relative', options],
      () => new Intl.RelativeTimeFormat(this.lang, options),
    )
  }

  /** `short` by default, as durations usually sit next to other text. */
  duration(options: Intl.DurationFormatOptions): Intl.DurationFormat {
    const all = { style: 'short' as const, ...options }
    return this.once(
      ['duration', all],
      () => new Intl.DurationFormat(this.lang, all),
    )
  }

  names(options: Intl.DisplayNamesOptions): Intl.DisplayNames {
    return this.once(
      ['names', options],
      () => new Intl.DisplayNames(this.lang, options),
    )
  }

  private once<F>(key: unknown[], build: () => F): F {
    return this.cache.remember(JSON.stringify(key), build) as F
  }
}
