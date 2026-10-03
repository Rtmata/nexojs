/** Grammatical gender, for languages whose ordinals agree with the noun. */
export type Gender = 'masculine' | 'feminine'

/**
 * What `Intl` has no words for, in one language. Numbers arrive already
 * written (`'1,000,000'`, `'XX'`), so each language only adds its words.
 */
export interface Words {
  /**
   * The digits its words go with (`'latn'` for English: '20th', never
   * '٢٠th'); without it, the page's own.
   */
  readonly numbering?: string
  ordinal(n: string, value: number, gender: Gender): string
  decade(start: number, short: boolean): string
  /** `write` gives the number as roman or ordinal, only when the language asks. */
  century(n: number, write: CenturyNumbers): string
}

export interface CenturyNumbers {
  roman(): string
  ordinal(): string
}

/** English suffixes follow English rules, whatever the page's language. */
const ENGLISH_ORDINALS = new Intl.PluralRules('en', { type: 'ordinal' })
const SUFFIXES: Record<string, string> = { one: 'st', two: 'nd', few: 'rd' }

const ENGLISH: Words = {
  numbering: 'latn',
  ordinal: (n, value) => n + (SUFFIXES[ENGLISH_ORDINALS.select(value)] ?? 'th'),
  decade: (y, short) => (short ? `the ${shortDecade(y, "'")}s` : `${y}s`),
  century: (_n, write) => `${write.ordinal()} century`,
}

const WORDS: Record<string, Words> = {
  en: ENGLISH,
  es: {
    ordinal: (n, _value, gender) => `${n}.${gender === 'feminine' ? 'ª' : 'º'}`,
    decade: (y, short) =>
      short ? `los ${shortDecade(y, '')}` : `década de ${y}`,
    century: (_n, write) => `siglo ${write.roman()}`,
  },
  fr: {
    ordinal: (n, value, gender) =>
      value === 1 ? (gender === 'feminine' ? '1re' : '1er') : `${n}e`,
    decade: (y, short) => `années ${short ? shortDecade(y, '') : y}`,
    century: (n, write) => `${write.roman()}${n === 1 ? 'er' : 'e'} siècle`,
  },
  it: {
    ordinal: (n, _value, gender) => `${n}${gender === 'feminine' ? 'ª' : 'º'}`,
    decade: (y, short) => `anni ${short ? shortDecade(y, '') : y}`,
    century: (_n, write) => `${write.roman()} secolo`,
  },
  pt: {
    ordinal: (n, _value, gender) => `${n}${gender === 'feminine' ? 'ª' : 'º'}`,
    decade: (y, short) => `anos ${short ? shortDecade(y, '') : y}`,
    century: (_n, write) => `século ${write.roman()}`,
  },
  de: {
    ordinal: (n) => `${n}.`,
    decade: (y, short) => `${short ? shortDecade(y, '') : y}er`,
    century: (n) => `${n}. Jahrhundert`,
  },
}

/** The words of a language (its base: 'es-MX' → 'es'); English when there are none. */
export function wordsFor(base: string): Words {
  return Object.hasOwn(WORDS, base) ? WORDS[base]! : ENGLISH
}

/** `1980` → `80`; 1910–1999 only: "'00" would read as the 2000s. */
function shortDecade(start: number, mark: string): string {
  return start >= 1910 && start < 2000
    ? mark + String(start).slice(2)
    : String(start)
}
