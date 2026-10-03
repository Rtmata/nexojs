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

  relative(numeric: 'auto' | 'always'): Intl.RelativeTimeFormat {
    return this.once(
      ['relative', numeric],
      () => new Intl.RelativeTimeFormat(this.lang, { numeric }),
    )
  }

  private once<F>(key: unknown[], build: () => F): F {
    return this.cache.remember(JSON.stringify(key), build) as F
  }
}
