import { isContainer, isGroup, shown, type Group } from './group'

/** What a message is, as the startup report names it. */
type Kind =
  | 'text'
  | 'a number'
  | 'a boolean'
  | 'a function'
  | 'a list'
  | 'a group'
  | 'a value'

/** The same group (or list) in each language that has it. */
type Branches = Map<string, Group | readonly unknown[]>

/**
 * Every language must have every message the others have, with the same
 * kind (text, function, group…); lists are compared item by item. The
 * languages' trees are walked side by side, and a branch that is missing
 * or of another kind somewhere is reported once, not key by key. Every
 * problem is listed at once, at startup.
 *
 *   ShapeCheck.ensure(['en', 'es'], messages)   // throws with the full list
 */
export class ShapeCheck {
  private readonly problems: string[] = []

  private constructor(
    private readonly languages: readonly string[],
    private readonly messages: Group,
  ) {}

  static ensure(languages: readonly string[], messages: unknown): void {
    if (!isGroup(messages)) {
      throw new Error(
        'voices: messages must be an object with one entry per language, like { en: { … }, es: { … } }',
      )
    }
    new ShapeCheck(languages, messages).run()
  }

  private run(): void {
    this.reportUnknownLanguages()
    this.compare(this.roots(), [])
    if (this.problems.length === 0) return
    throw new Error(
      `voices: the languages don't match. Give every language the same messages:\n  ${this.problems.join('\n  ')}`,
    )
  }

  private reportUnknownLanguages(): void {
    const unknown = Object.keys(this.messages).filter(
      (lang) => !this.languages.includes(lang),
    )
    for (const lang of unknown) {
      this.problems.push(
        `"${lang}" is not one of the languages (${this.languages.join(', ')})`,
      )
    }
  }

  /** Each language's messages; one without a group of them is reported. */
  private roots(): Branches {
    const roots: Branches = new Map()
    for (const lang of this.languages) {
      const value = Object.hasOwn(this.messages, lang)
        ? this.messages[lang]
        : undefined
      if (isGroup(value)) roots.set(lang, value)
      else this.problems.push(notAGroup(lang, value))
    }
    return roots
  }

  private compare(branches: Branches, path: readonly string[]): void {
    for (const key of keysOf(branches))
      this.compareKey(branches, [...path, key])
  }

  /** One key in every language: missing somewhere, of different kinds, or alike (then look inside). */
  private compareKey(branches: Branches, path: readonly string[]): void {
    const values = valuesAt(branches, path.at(-1)!)
    const missing = [...branches.keys()].filter((lang) => !values.has(lang))
    for (const lang of missing) {
      this.problems.push(`"${lang}" is missing "${shown(path)}"`)
    }
    const kinds = languagesByKind(values)
    if (kinds.size > 1) this.problems.push(differentKinds(path, kinds))
    else if (missing.length === 0) this.compareInside(values, path)
  }

  /** Alike everywhere: if they're groups or lists, compare what they hold. */
  private compareInside(values: Map<string, unknown>, path: readonly string[]) {
    const inner: Branches = new Map()
    for (const [lang, value] of values) {
      if (isContainer(value)) inner.set(lang, value)
    }
    if (inner.size > 0) this.compare(inner, path)
  }
}

function notAGroup(lang: string, value: unknown): string {
  if (value === undefined) return `"${lang}" has no messages`
  return `"${lang}" messages must be an object`
}

/** Every key any language has here, in order (list items by position). */
function keysOf(branches: Branches): string[] {
  const keys = new Set([...branches.values()].flatMap((b) => Object.keys(b)))
  const list = [...keys]
  const isList = Array.isArray([...branches.values()][0])
  return isList ? list.sort((a, b) => Number(a) - Number(b)) : list.sort()
}

/** The message under `key` in each language that has one (null and undefined don't count). */
function valuesAt(branches: Branches, key: string): Map<string, unknown> {
  const values = new Map<string, unknown>()
  for (const [lang, branch] of branches) {
    const value = (branch as Group)[key]
    if (Object.hasOwn(branch, key) && value != null) values.set(lang, value)
  }
  return values
}

/** The languages that have a message, by the kind it has in each. */
function languagesByKind(values: Map<string, unknown>): Map<Kind, string[]> {
  const byKind = new Map<Kind, string[]>()
  for (const [lang, value] of values) {
    const kind = kindOf(value)
    byKind.set(kind, [...(byKind.get(kind) ?? []), lang])
  }
  return byKind
}

function differentKinds(
  path: readonly string[],
  kinds: Map<Kind, string[]>,
): string {
  const described = [...kinds].map(
    ([kind, langs]) => `${kind} in ${langs.join(', ')}`,
  )
  return `"${shown(path)}" is ${described.join(' but ')}`
}

function kindOf(value: unknown): Kind {
  if (typeof value === 'string') return 'text'
  if (typeof value === 'number' || typeof value === 'bigint') return 'a number'
  if (typeof value === 'boolean') return 'a boolean'
  if (typeof value === 'function') return 'a function'
  if (Array.isArray(value)) return 'a list'
  return isGroup(value) ? 'a group' : 'a value'
}
