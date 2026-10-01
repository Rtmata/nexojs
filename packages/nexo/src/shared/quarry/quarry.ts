/**
 * Shapes raw values for readers in a language: numbers, plurals, lists,
 * capitalization and partial dates. Built on the platform's `Intl`, so every
 * language `Intl` knows works; quarry only adds what `Intl` doesn't have.
 *
 *   const q = quarry('es')
 *   q.number(1234.5)                                  // '1234,5'
 *   q.plural(12, { one: '# juego', other: '# juegos' }) // '12 juegos'
 *   q.list(['Capcom', 'Sega', 'Taito'])               // 'Capcom, Sega y Taito'
 *   q.partialDate('198')                              // 'década de 1980'
 *
 * Works on its own: no router, no translations needed.
 */
export interface Quarry {
  /** The language every method formats for. */
  readonly lang: string
  number(value: number, options?: Intl.NumberFormatOptions): string
  /**
   * Pick the form for a count and put the formatted number where `#` is.
   * `other` is required; add `one`, `few`, `many`… as the language needs.
   */
  plural(count: number, forms: PluralForms): string
  list(items: readonly string[], options?: Intl.ListFormatOptions): string
  /** First letter uppercase, by the language's rules. */
  capitalize(text: string): string
  /**
   * A partial ISO date, never inventing precision:
   * `1991-05-22` → full date, `1991-05` → month and year, `1991` → year,
   * `198` → the decade, `19` → the century. `null` or `''` give `''`.
   */
  partialDate(date: string | null, options?: PartialDateOptions): string
}

export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & {
  other: string
}

export interface PartialDateOptions {
  /** How months are written: `'long'` (default) or `'short'`. */
  month?: 'long' | 'short'
}

/**
 * How decades and centuries read, since `Intl` has no words for them.
 * Languages missing here fall back to `1980s` / `1900s`.
 */
const SPANS: Record<
  string,
  { decade(start: number): string; century(start: number): string }
> = {
  en: { decade: (y) => `${y}s`, century: (y) => `${y}s` },
  es: { decade: (y) => `década de ${y}`, century: (y) => `años ${y}` },
}

export function quarry(lang: string): Quarry {
  const plurals = new Intl.PluralRules(lang)
  const base = lang.split('-')[0]!
  const spans = SPANS[lang] ?? SPANS[base] ?? SPANS.en!

  const q: Quarry = {
    lang,

    number: (value, options) =>
      new Intl.NumberFormat(lang, options).format(value),

    plural(count, forms) {
      const form = forms[plurals.select(count)] ?? forms.other
      return form.replaceAll('#', q.number(count))
    },

    list: (items, options) =>
      new Intl.ListFormat(lang, { type: 'conjunction', ...options }).format(
        items,
      ),

    capitalize(text) {
      const [first = '', ...rest] = text
      return first.toLocaleUpperCase(lang) + rest.join('')
    },

    partialDate(date, options = {}) {
      if (!date) return ''
      const match = /^(\d{2,4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(date)
      if (!match) throw new Error(`quarry: "${date}" is not a partial ISO date`)
      const [, year, month, day] = match
      if (year!.length === 2) return spans.century(Number(year) * 100)
      if (year!.length === 3) return spans.decade(Number(year) * 10)
      if (!month) return year!

      // UTC on both ends, so the server's time zone never shifts the day.
      const when = new Date(
        Date.UTC(Number(year), Number(month) - 1, Number(day ?? 1)),
      )
      return new Intl.DateTimeFormat(lang, {
        timeZone: 'UTC',
        year: 'numeric',
        month: options.month ?? 'long',
        ...(day ? { day: 'numeric' } : {}),
      }).format(when)
    },
  }
  return q
}
