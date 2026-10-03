/**
 * Letters whose capital at the start of a word isn't their uppercase:
 * digraphs take their titlecase form, and ß becomes 'Ss', not 'SS'.
 */
const TITLECASE: Record<string, string> = {
  ǆ: 'ǅ',
  Ǆ: 'ǅ',
  ǉ: 'ǈ',
  Ǉ: 'ǈ',
  ǌ: 'ǋ',
  Ǌ: 'ǋ',
  ǳ: 'ǲ',
  Ǳ: 'ǲ',
  ß: 'Ss',
}

/** How one language capitalizes a word differently from the rest. */
interface CapitalRule {
  /** How many characters the first letter takes: Dutch 'ij' is one letter. */
  firstLength?(word: string): number
  /** The capital of that letter. */
  upper?(letter: string): string
}

const RULES: Record<string, CapitalRule> = {
  nl: { firstLength: (word) => (/^ij/i.test(word) ? 2 : 1) }, // 'IJsland'
  // Greek drops accents only in all-caps text; an initial capital keeps
  // them ('Άλφα'). toUpperCase is the same on every server.
  el: { upper: (letter) => letter.toUpperCase() },
}

/**
 * First letter uppercase, by the language's rules: past any opening ¿ ¡ «
 * ( or quote; text that starts with a number ('22 de mayo') stays as it is.
 *
 *   capitalize('ijsland', 'nl', 'nl')   // 'IJsland'
 */
export function capitalize(text: string, lang: string, base: string): string {
  const at = text.search(/[\p{L}\p{N}]/u)
  if (at === -1 || /\p{N}/u.test(text[at]!)) return text
  const rule = Object.hasOwn(RULES, base) ? RULES[base]! : {}
  const first = firstLetter(text.slice(at), rule)
  const capital = rule.upper?.(first) ?? titlecase(first, lang)
  return text.slice(0, at) + capital + text.slice(at + first.length)
}

function firstLetter(word: string, rule: CapitalRule): string {
  const length = rule.firstLength?.(word) ?? 1
  return length > 1
    ? word.slice(0, length)
    : String.fromCodePoint(word.codePointAt(0)!)
}

function titlecase(letter: string, lang: string): string {
  return TITLECASE[letter] ?? letter.toLocaleUpperCase(lang)
}
