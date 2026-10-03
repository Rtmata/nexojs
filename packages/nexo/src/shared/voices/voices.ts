import { FrozenCopy } from './frozen-copy'
import { LanguageList, type Found } from './language-list'
import { ShapeCheck } from './shape-check'
import { VersionPicker, type Picked, type Versions } from './version-picker'

export type { Picked, Versions } from './version-picker'

/**
 * The interface's words in every language. Messages are plain values and
 * functions you write; voices only checks that every language says
 * everything, and hands you the right set:
 *
 *   const en = quarry('en')
 *   const es = quarry('es')
 *   const t = voices(['en', 'es'], {
 *     en: { consoles: 'Consoles', games: (n: number) => en.plural(n, { one: '# game', other: '# games' }) },
 *     es: { consoles: 'Consolas', games: (n: number) => es.plural(n, { one: '# juego', other: '# juegos' }) },
 *   })
 *
 *   t('es').consoles   // 'Consolas'
 *   t('es').games(12)  // '12 juegos'
 *
 * The language list is a plain array, so voices works with any router — or
 * none. With boat: `voices(router.languages, …)`.
 *
 * Messages are optional: `voices(['en', 'es'])` is enough to `pick` the
 * right version of texts that come from elsewhere (a database, a CMS).
 */
export type Voices<L extends string, M> = ((lang?: L | null) => M) & {
  /** The languages given to `voices()`; the first one is the default. */
  readonly languages: readonly L[]
  /**
   * The messages for any one tag — a cookie, a query value, a database
   * field — and
   * whether they're a fallback: the language asked, else the closest
   * ('es-MX' → 'es'), else the default. Never throws for a visitor's tag.
   *
   *   t.for('es-MX')   // { messages: …es, lang: 'es', fallback: false }
   *   t.for('fr')      // { messages: …en, lang: 'en', fallback: true }
   */
  for(lang: string | null | undefined): Voiced<L, M>
  /**
   * Choose the version of a text (or anything) for a language: the one asked
   * for, else the first available in `languages` order (the default first),
   * else any. `null` when there are no versions at all. Says which language
   * it found, so the page can tell the visitor.
   *
   *   t.pick({ en: 'Fighter / Versus' }, 'es')
   *   // { value: 'Fighter / Versus', lang: 'en', fallback: true }
   */
  pick<T, K extends string = string>(
    versions: Versions<T, K> | null | undefined,
    lang?: string | null,
  ): Picked<T> | null
}

/** The messages `t.for()` found, their language, and whether that's a fallback. */
export interface Voiced<L extends string, M> {
  messages: M
  lang: L
  fallback: boolean
}

/**
 * The interface's words for these languages, checked at startup:
 *
 *   const t = voices(['en', 'es'], {
 *     en: { consoles: 'Consoles' },
 *     es: { consoles: 'Consolas' },
 *   })
 *   t('es').consoles   // 'Consolas'
 *
 * `t(lang)` takes the declared languages (the editor checks) and falls back
 * to the default like `t.for()`, so a request never fails over its language.
 */
export function voices<
  const L extends string,
  const Messages extends { [K in L]: object } = { [K in L]: {} },
>(languages: readonly L[], messages?: Messages): Voices<L, Messages[L]> {
  const list = new LanguageList(languages)
  // Copied first, then checked: what the check verified is exactly what
  // every request gets, and the caller's own objects are left untouched.
  const all = FrozenCopy.of(messages ?? list.emptyMessages()) as Messages
  ShapeCheck.ensure(list.declared, all)
  const pick = picking(new VersionPicker(list.declared))
  const voiced = (lang: string | null | undefined) =>
    withMessages<L, Messages[L]>(list.find(lang), all)
  const t = (lang?: L | null) => voiced(lang).messages
  // Frozen: what was checked can't be swapped from JavaScript either.
  return Object.freeze(
    Object.assign(t, { languages: list.declared, for: voiced, pick }),
  )
}

function withMessages<L extends string, M>(
  found: Found<L>,
  all: { [K in L]: M },
): Voiced<L, M> {
  return { ...found, messages: all[found.lang] }
}

/** `t.pick`, as a plain function of the picker. */
function picking(picker: VersionPicker): Voices<string, unknown>['pick'] {
  return (versions, lang) => picker.pick(versions, lang)
}
