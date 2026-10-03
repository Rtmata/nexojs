import type { Formats } from './formats'

/**
 * Letters that don't decompose into a–z, by language; '*' applies to all.
 * Languages spell some of them differently (German ü → ue, Swedish å → aa).
 * Lowercase only: text is lowercased before it meets the table.
 */
const NORDIC: Record<string, string> = { å: 'aa', æ: 'ae', ø: 'oe' }
const LETTERS: Record<string, Record<string, string>> = {
  de: { ä: 'ae', ö: 'oe', ü: 'ue' },
  sv: { å: 'aa', ä: 'ae', ö: 'oe' },
  da: NORDIC,
  no: NORDIC,
  nb: NORDIC, // Bokmål and Nynorsk spell them as Norwegian does
  nn: NORDIC,
  '*': {
    ß: 'ss',
    ð: 'd',
    ħ: 'h',
    ŋ: 'ng',
    ŧ: 't',
    æ: 'ae',
    œ: 'oe',
    ø: 'o',
    ı: 'i',
    ł: 'l',
    đ: 'd',
    þ: 'th',
  },
}

/**
 * Text for a URL, by a language's rules: `'Tom & Jerry'` → `'tom-and-jerry'`
 * / `'tom-y-jerry'`; German `'Größe'` → `'groesse'`. Letters outside a–z
 * that can't be spelled in it are dropped, never turned into separators.
 */
export class Slugger {
  /** The language's letters over the shared ones, as one lookup. */
  private readonly letters: Record<string, string>
  /** Every letter of the table, matched in one pass. */
  private readonly anyLetter: RegExp

  constructor(
    private readonly formats: Formats,
    base: string,
  ) {
    const own = Object.hasOwn(LETTERS, base) ? LETTERS[base]! : {}
    this.letters = { ...LETTERS['*']!, ...own }
    this.anyLetter = new RegExp(`[${Object.keys(this.letters).join('')}]`, 'g')
  }

  slug(text: string): string {
    // NFC first, so 'ü' typed as u + ¨ still meets the letter table; lowercase
    // without the locale: Turkish would turn I into ı, outside a–z.
    const lower = this.spellAnd(text.normalize('NFC')).toLowerCase()
    const spelled = lower.replace(this.anyLetter, (l) => this.letters[l]!)
    return toAscii(spelled)
  }

  /**
   * '&' becomes the language's own "and", as `Intl` writes it next to these
   * words ('Tom & Ivy' → 'Tom e Ivy' in Spanish). An "and" with no a–z
   * spelling (Russian 'и', Chinese '和') becomes a separator instead.
   */
  private spellAnd(text: string): string {
    return text.replace(
      /([^\s&]*)\s*&\s*([^\s&]*)/g, // each & on its own: 'R&D & Co'
      (_, left: string, right: string) =>
        left + this.andBetween(left, right) + right,
    )
  }

  /** The "and" `Intl` writes between two words, or a space when it isn't a–z. */
  private andBetween(left: string, right: string): string {
    const [first, last] = [left || 'a', right || 'a']
    const joined = this.formats.list().format([first, last])
    const and = joined.slice(first.length, joined.length - last.length)
    return toAscii(and) ? and : ' '
  }
}

/** Accents dropped, apostrophes joined, everything else a single '-'. */
const ASCII_STEPS: [RegExp, string][] = [
  [/\p{M}/gu, ''], // accents and other marks, once NFKD has split them off
  [/['’ʼ]/g, ''], // "Assassin's" → "assassins"
  [/[^\p{L}\p{N}]+/gu, '-'],
  [/[^a-z0-9-]/g, ''],
  [/-{2,}/g, '-'],
  [/^-+|-+$/g, ''],
]

function toAscii(text: string): string {
  const plain = text.normalize('NFKD').toLowerCase()
  return ASCII_STEPS.reduce((out, [from, to]) => out.replace(from, to), plain)
}
