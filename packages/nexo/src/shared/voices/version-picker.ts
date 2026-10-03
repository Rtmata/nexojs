import { canonicalTag, matchTag } from '../lang/tag'

/**
 * One value per language, any of them possibly missing:
 * `{ en: 'Fighter' }`. `null`, `undefined` and `''` count as missing, as
 * they come from a database or a CMS field nobody filled in.
 */
export type Versions<T, K extends string = string> = Readonly<
  Partial<Record<K, T | null | undefined>>
>

/** The chosen version, the language it's in, and whether that's a fallback. */
export interface Picked<T> {
  value: T
  /** The key it came from, as written in the versions (`'es-MX'`, `'en'`…). */
  lang: string
  /** True when `value` is not in the language that was asked for. */
  fallback: boolean
}

/**
 * Chooses the version of a text for a language: the one asked for (or its
 * closest: `'es'` ↔ `'es-MX'`, never across scripts), else the first
 * available in `languages` order, else any. Tags ignore case (BCP 47).
 * Only keys that are language tags count, so a whole database row
 * (`{ id: 5, en: …, es: … }`) never answers with its `5`.
 *
 *   new VersionPicker(['en', 'es']).pick({ en: 'Fighter' }, 'es')
 *   // { value: 'Fighter', lang: 'en', fallback: true }
 */
export class VersionPicker {
  constructor(private readonly languages: readonly string[]) {}

  /** `lang` missing: the default, the first of `languages`. */
  pick<T, K extends string>(
    versions: Versions<T, K> | null | undefined,
    lang?: string | null,
  ): Picked<T> | null {
    if (versions === null || versions === undefined) return null
    const keys = languageKeys(versions as Record<string, unknown>)
    if (keys.length === 0) return null
    const { key, fallback } = this.choose(keys, lang ?? this.languages[0]!)
    return { value: (versions as Record<string, T>)[key]!, lang: key, fallback }
  }

  private choose(keys: string[], lang: string) {
    const own = matchTag(keys, lang)
    if (own) return { key: own, fallback: false }
    for (const language of this.languages) {
      const key = matchTag(keys, language)
      if (key !== undefined) return { key, fallback: true }
    }
    return { key: keys[0]!, fallback: true }
  }
}

/** The keys that are language tags and hold a value. Numbers ('5') are no tags. */
function languageKeys(versions: Record<string, unknown>): string[] {
  return Object.keys(versions).filter(
    (key) =>
      !/^\d+$/.test(key) && canonicalTag(key) !== null && filled(versions[key]),
  )
}

function filled(value: unknown): boolean {
  return value !== undefined && value !== null && value !== ''
}
