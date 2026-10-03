import { baseOf, canonicalTag } from '../lang/tag'
import { BoundedCache } from '../cache/bounded-cache'
import { capitalize } from './capitalize'
import { Formats } from './formats'
import { Numbers, type PluralForms } from './numbers'
import type { Year } from './partial-date'
import { Slugger } from './slugger'
import { wordsFor, type Gender } from './words'
import { Years, type CalendarOptions, type PartialDateOptions } from './years'

export type { PluralForms } from './numbers'
export type { Gender } from './words'
export type { Year } from './partial-date'
export type { CalendarOptions, PartialDateOptions } from './years'

/**
 * Shapes raw values for readers in a language: numbers, ordinals, plurals,
 * lists, capitalization, dates and years. Built on the platform's `Intl`, so
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
   */
  partialDate(date: string | null, options?: PartialDateOptions): string
  /** The decade of a year or partial date: `'1980s'`, or `"the '80s"` with `short`. */
  decade(year: Year, options?: { short?: boolean }): string
  /** The century of a year or partial date: `'20th century'` / `'siglo XX'`. */
  century(year: Year): string
  /** `1985, 1990` → `'1985–1990'`, as the language writes ranges. */
  yearRange(from: Year, to: Year, options?: CalendarOptions): string
  /** How long ago: `'1991'` → `'35 years ago'`. Needs at least a full year. */
  ago(date: Year, now?: Date): string
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

  constructor(readonly lang: string) {
    this.base = baseOf(lang)
    const words = wordsFor(this.base)
    this.formats = new Formats(lang)
    this.numbers = new Numbers(this.formats, words)
    this.years = new Years(this.formats, words, this.numbers)
    this.slugger = new Slugger(this.formats, this.base)
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
}

/** The tag as `Intl` writes it, so 'ES', 'es' and 'es_es'… share one quarry. */
function canonical(lang: string): string {
  const tag = canonicalTag(lang)
  if (tag !== null) return tag
  throw new Error(
    `quarry: "${lang}" is not a language tag. Give one like 'es', 'es-MX' or 'pt-BR'`,
  )
}
