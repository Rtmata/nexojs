import { baseOf, canonicalTag } from '../lang/tag'
import { BoundedCache } from '../cache/bounded-cache'
import {
  CalendarNames,
  type NameOptions,
  type WeekdayName,
} from './calendar-names'
import { capitalize } from './capitalize'
import { DisplayNames, type DisplayNameOptions } from './display-names'
import { Durations, type Duration, type DurationOptions } from './durations'
import { Formats } from './formats'
import { Moments, type RelativeOptions } from './moments'
import { Numbers, type PluralForms } from './numbers'
import type { Year } from './partial-date'
import { bytes, type BytesOptions } from './sizes'
import { Slugger } from './slugger'
import { wordsFor, type Gender } from './words'
import { Years, type CalendarOptions, type PartialDateOptions } from './years'

export type { NameOptions, NameStyle, WeekdayName } from './calendar-names'
export type { DisplayNameOptions } from './display-names'
export type { Duration, DurationOptions, DurationUnit } from './durations'
export type { RelativeOptions, RelativeUnit } from './moments'
export type { PluralForms } from './numbers'
export type { BytesOptions } from './sizes'
export type { Gender } from './words'
export type { Year } from './partial-date'
export type { CalendarOptions, PartialDateOptions } from './years'

/**
 * Shapes raw values for readers in a language: numbers, ordinals, plurals,
 * lists, capitalization, dates and years, sizes, durations, and the names of
 * months, weekdays, languages and more. Built on the platform's `Intl`, so
 * every language `Intl` knows works; quarry only adds what `Intl` doesn't have.
 *
 *   const q = quarry('es')
 *   q.number(1234.5)                                    // '1234,5'
 *   q.ordinal(5, { gender: 'feminine' })                // '5.ª'
 *   q.plural(12, { one: '# juego', other: '# juegos' })   // '12 juegos'
 *   q.list(['Capcom', 'Sega', 'Taito'])                 // 'Capcom, Sega y Taito'
 *   q.partialDate('198')                                // 'década de 1980'
 *   q.century(1985)                                     // 'siglo XX'
 *
 * Works on its own: no router, no translations needed.
 */
export interface Quarry {
  /** The language every method formats for. */
  readonly lang: string
  number(value: number, options?: Intl.NumberFormatOptions): string
  /** `3` → `'3rd'` / `'3.º'` (`'3.ª'` with `gender: 'feminine'`). Whole numbers. */
  ordinal(value: number, options?: OrdinalOptions): string
  /** `1991` → `'MCMXCI'`. Whole numbers from 1 to 3999. */
  roman(value: number): string
  /**
   * Pick the form for a count and put the formatted number where `#` is
   * (`\#` for a literal one). `other` is required; add `one`, `few`, `many`…
   * as the language needs.
   */
  plural(count: number, forms: PluralForms): string
  list(items: readonly string[], options?: Intl.ListFormatOptions): string
  /** First letter uppercase, by the language's rules. */
  capitalize(text: string): string
  /**
   * Text for a URL, by the language's rules: `'Tom & Jerry'` →
   * `'tom-and-jerry'` / `'tom-y-jerry'`; German `'Größe'` → `'groesse'`.
   * Letters outside a–z that can't be spelled in it are dropped.
   */
  slug(text: string): string
  /**
   * A partial ISO date, never inventing precision:
   * `1991-05-22` → full date, `1991-05` → month and year, `1991` → year,
   * `198` → the decade, `19` → the century. `null` or `''` give `''`.
   * A time after the day is ignored: the day stays the one written. For an
   * exact moment read in the reader's time zone, use `date`.
   */
  partialDate(date: string | null, options?: PartialDateOptions): string
  /**
   * The day of an exact moment, in the reader's time zone by default:
   * `new Date('2026-10-21T02:00:00Z')` → `'20 de octubre de 2026'` in Mexico.
   * Fields add to the full date (`{ month: 'short' }`, `{ hour: 'numeric' }`);
   * `dateStyle` and `timeStyle` go to `Intl` alone, which can't mix them.
   */
  date(moment: Date, options?: Intl.DateTimeFormatOptions): string
  /**
   * How far from now, past or future: `'hace 2 horas'`, `'ayer'`, `'en 3 años'`.
   * Elapsed time under a day, calendar days from there on.
   */
  relative(moment: Date, options?: RelativeOptions): string
  /** The decade of a year or partial date: `'1980s'`, or `"the '80s"` with `short`. */
  decade(year: Year, options?: { short?: boolean }): string
  /** The century of a year or partial date: `'20th century'` / `'siglo XX'`. */
  century(year: Year): string
  /** `1985, 1990` → `'1985–1990'`, as the language writes ranges. */
  yearRange(from: Year, to: Year, options?: CalendarOptions): string
  /** How long ago: `'1991'` → `'35 years ago'`. Needs at least a full year. */
  ago(date: Year, now?: Date): string
  /**
   * `1887436` → `'1,9 MB'`, counting in 1000s. With `binary`, in 1024s:
   * `'1,8 MiB'`. Number options pass through.
   */
  bytes(value: number, options?: BytesOptions): string
  /**
   * `{ minutes: 190 }` → `'3 h y 10 min'`. Say the unit you have; it's split
   * and rounded to the smallest one given. `units` limits how many show.
   */
  duration(duration: Duration, options?: DurationOptions): string
  /** `9` → `'septiembre'`, `'sept'` with `style: 'short'`. From 1 to 12. */
  month(month: number, options?: NameOptions): string
  /** `7` → `'domingo'`. ISO: 1 is Monday, 7 is Sunday. */
  weekday(day: number, options?: NameOptions): string
  /** The twelve month names, in order. */
  months(options?: NameOptions): string[]
  /** The seven days from the one the language's week starts on, each with its ISO number. */
  weekdays(options?: NameOptions): WeekdayName[]
  /** `'es'` → `'español'`. `''` when there's no name for it, like `'und'`. */
  language(code: string | null, options?: DisplayNameOptions): string
  /** `'JP'` → `'Japón'`. `''` when there's no name for it. */
  region(code: string | null, options?: DisplayNameOptions): string
  /** `'MXN'` → `'peso mexicano'`. `''` when there's no name for it. */
  currency(code: string | null, options?: DisplayNameOptions): string
  /** `'Latn'` → `'latino'`. `''` when there's no name for it. */
  script(code: string | null, options?: DisplayNameOptions): string
  /** `'gregory'` → `'calendario gregoriano'`. `''` when there's no name for it. */
  calendar(code: string | null, options?: DisplayNameOptions): string
  /** `'month'` → `'mes'`: a part of a date. `''` when there's no name for it. */
  field(code: string | null, options?: DisplayNameOptions): string
}

export interface OrdinalOptions {
  /** For languages whose ordinals agree with the noun (es, fr, it, pt). */
  gender?: Gender
}

/**
 * One quarry per language, its formatters built once and shared. Bounded,
 * since tags may come from visitors and there's no end to valid ones.
 */
const byLanguage = new BoundedCache<string, Quarry>(64)

/**
 * The quarry for a language tag (`'es'`, `'es-MX'`, `'es_MX'`):
 *
 *   const q = quarry('es')
 *   q.plural(12, { one: '# juego', other: '# juegos' })   // '12 juegos'
 */
export function quarry(lang: string): Quarry {
  const tag = canonical(lang)
  return byLanguage.remember(tag, () => new LanguageQuarry(tag))
}

/**
 * The quarry for a tag from a visitor (a cookie, a header, a database
 * field): never throws. A tag that isn't one gets the `fallback` language.
 *
 *   quarry.for(request.headers.get('x-lang'))   // quarry('en') if it's junk
 */
quarry.for = (lang: string | null | undefined, fallback = 'en'): Quarry =>
  quarry((lang == null ? null : canonicalTag(lang)) ?? fallback)

/**
 * Quarry for one language (pattern: facade): numbers, years, slugs and
 * capitalization each live in their own class. Its methods are bound, like
 * `Intl.NumberFormat`'s `format`, so `const { slug } = quarry('en')` works.
 */
class LanguageQuarry implements Quarry {
  private readonly base: string
  private readonly formats: Formats
  private readonly numbers: Numbers
  private readonly years: Years
  private readonly slugger: Slugger
  private readonly moments: Moments
  private readonly durations: Durations
  private readonly calendarNames: CalendarNames
  private readonly displayNames: DisplayNames

  constructor(readonly lang: string) {
    this.base = baseOf(lang)
    const words = wordsFor(this.base)
    this.formats = new Formats(lang)
    this.numbers = new Numbers(this.formats, words)
    this.years = new Years(this.formats, words, this.numbers)
    this.slugger = new Slugger(this.formats, this.base)
    this.moments = new Moments(this.formats)
    this.durations = new Durations(this.formats)
    this.calendarNames = new CalendarNames(this.formats)
    this.displayNames = new DisplayNames(this.formats)
  }

  readonly number = (value: number, options?: Intl.NumberFormatOptions) =>
    this.numbers.number(value, options)

  readonly ordinal = (value: number, options: OrdinalOptions = {}) =>
    this.numbers.ordinal(value, options.gender)

  readonly roman = (value: number) => this.numbers.roman(value)

  readonly plural = (count: number, forms: PluralForms) =>
    this.numbers.plural(count, forms)

  readonly list = (
    items: readonly string[],
    options?: Intl.ListFormatOptions,
  ) => this.formats.list(options).format(items)

  readonly capitalize = (text: string) => capitalize(text, this.lang, this.base)

  readonly slug = (text: string) => this.slugger.slug(text)

  readonly partialDate = (date: string | null, options?: PartialDateOptions) =>
    this.years.partialDate(date, options)

  readonly decade = (year: Year, options?: { short?: boolean }) =>
    this.years.decade(year, options)

  readonly century = (year: Year) => this.years.century(year)

  readonly yearRange = (from: Year, to: Year, options?: CalendarOptions) =>
    this.years.yearRange(from, to, options)

  readonly ago = (date: Year, now?: Date) => this.years.ago(date, now)

  readonly date = (moment: Date, options?: Intl.DateTimeFormatOptions) =>
    this.moments.date(moment, options)

  readonly relative = (moment: Date, options?: RelativeOptions) =>
    this.moments.relative(moment, options)

  readonly bytes = (value: number, options?: BytesOptions) =>
    bytes(this.numbers, value, options)

  readonly duration = (duration: Duration, options?: DurationOptions) =>
    this.durations.duration(duration, options)

  readonly month = (month: number, options?: NameOptions) =>
    this.calendarNames.month(month, options)

  readonly weekday = (day: number, options?: NameOptions) =>
    this.calendarNames.weekday(day, options)

  readonly months = (options?: NameOptions) =>
    this.calendarNames.months(options)

  readonly weekdays = (options?: NameOptions) =>
    this.calendarNames.weekdays(options)

  readonly language = (code: string | null, options?: DisplayNameOptions) =>
    this.displayNames.name('language', code, options)

  readonly region = (code: string | null, options?: DisplayNameOptions) =>
    this.displayNames.name('region', code, options)

  readonly currency = (code: string | null, options?: DisplayNameOptions) =>
    this.displayNames.name('currency', code, options)

  readonly script = (code: string | null, options?: DisplayNameOptions) =>
    this.displayNames.name('script', code, options)

  readonly calendar = (code: string | null, options?: DisplayNameOptions) =>
    this.displayNames.name('calendar', code, options)

  readonly field = (code: string | null, options?: DisplayNameOptions) =>
    this.displayNames.name('dateTimeField', code, options)
}

/** The tag as `Intl` writes it, so 'ES', 'es' and 'es_es'… share one quarry. */
function canonical(lang: string): string {
  const tag = canonicalTag(lang)
  if (tag !== null) return tag
  throw new Error(
    `quarry: "${lang}" is not a language tag. Give one like 'es', 'es-MX' or 'pt-BR'`,
  )
}
