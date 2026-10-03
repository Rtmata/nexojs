import { canonicalTag, matchTag, sameMeaning } from '../lang/tag'

/** Which language was found, and whether it's a fallback for the one asked. */
export interface Found<L extends string> {
  lang: L
  fallback: boolean
}

/** The languages given to `voices()`, checked once; the first is the default. */
export class LanguageList<L extends string> {
  readonly declared: readonly L[]

  constructor(languages: readonly L[]) {
    if (languages.length === 0) {
      throw new Error("voices: give at least one language, like voices(['en'])")
    }
    this.declared = Object.freeze([...languages])
    this.declared.forEach(ensureTag)
    this.ensureNoTwins()
  }

  get default(): L {
    return this.declared[0]!
  }

  /**
   * The language to use for a tag: the one asked, else the closest
   * ('es-MX' ↔ 'es'); none, or one not declared: the default.
   */
  find(lang: string | null | undefined): Found<L> {
    const found = lang == null ? undefined : matchTag(this.declared, lang)
    if (found !== undefined) return { lang: found, fallback: false }
    return { lang: this.default, fallback: lang != null }
  }

  /** No messages at all: an empty group per language. */
  emptyMessages(): Record<L, object> {
    const entries = this.declared.map((lang) => [lang, {}])
    return Object.fromEntries(entries) as Record<L, object>
  }

  /** Tags that mean the same language ('en', 'EN'; 'zh-TW', 'zh-Hant-TW') can't both be there. */
  private ensureNoTwins(): void {
    const twins = this.declared.filter((lang, i) =>
      this.declared.some((other, j) => j !== i && sameMeaning(lang, other)),
    )
    if (twins.length === 0) return
    throw new Error(
      `voices: ${twins.map((l) => `"${l}"`).join(', ')} name the same language more than once. Keep one of each`,
    )
  }
}

function ensureTag(lang: string): void {
  if (canonicalTag(lang) !== null) return
  throw new Error(
    `voices: "${lang}" is not a language tag. Give one like 'es', 'es-MX' or 'pt-BR'`,
  )
}
