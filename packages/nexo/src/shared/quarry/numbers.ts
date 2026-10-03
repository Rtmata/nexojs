import type { Formats } from './formats'
import type { Gender, Words } from './words'

export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & {
  other: string
}

const ROMAN: [number, string][] = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
]

/** Numbers as a language writes them: plain, ordinal, roman and in plurals. */
export class Numbers {
  constructor(
    private readonly formats: Formats,
    private readonly words: Words,
  ) {}

  number(value: number, options?: Intl.NumberFormatOptions): string {
    return this.formats.number(options).format(value)
  }

  /** `3` → `'3rd'` / `'3.º'`. Whole numbers only. */
  ordinal(value: number, gender: Gender = 'masculine'): string {
    if (!Number.isInteger(value))
      throw new Error(`quarry: ${value} has no ordinal. Give a whole number`)
    const { numbering } = this.words
    const written = this.number(
      value,
      numbering ? { numberingSystem: numbering } : {},
    )
    return this.words.ordinal(written, value, gender)
  }

  /** `1991` → `'MCMXCI'`. Whole numbers from 1 to 3999. */
  roman(value: number): string {
    ensureRoman(value)
    let rest = value
    return ROMAN.map(([amount, letters]) => {
      const times = Math.floor(rest / amount)
      rest -= times * amount
      return letters.repeat(times)
    }).join('')
  }

  /** The form for a count, with the formatted count where `#` is (`\#` is a literal #). */
  plural(count: number, forms: PluralForms): string {
    const form = forms[this.formats.plurals().select(count)] ?? forms.other
    const written = this.number(count) // formatted once, however many #
    return form
      .split('\\#')
      .map((part) => part.replaceAll('#', written))
      .join('#')
  }
}

function ensureRoman(value: number): void {
  if (Number.isInteger(value) && value >= 1 && value <= 3999) return
  throw new Error(
    `quarry: roman numerals go from 1 to 3999, not ${value}. Write the number with number() instead`,
  )
}
