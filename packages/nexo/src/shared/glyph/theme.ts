import { checkProblems, contrastShortfalls, lineOf } from './contrast-checks'
import type { ContrastUse } from './color/contrast'
import { rule, sheet, type Sheet } from './sheet'
import {
  DEFINITION,
  type ContrastCheck,
  type Defined,
  type ThemeScheme,
  type TokenSet,
} from './token-set'
import { cssString } from './css-string'
import { referenceCycles } from './grammar/cycles'
import type { ThemeError } from './theme-error'
import { changeProblems, codeValue, type ValueCheck } from './theme-values'
import type { NamesOf } from './tokens'
import type {
  GROUP_TYPES,
  KnownGroup,
  Reference,
  TokenType,
  TokenValues,
  TypedGroup,
} from './typed'

/**
 * A theme: a sheet that sets every token under `[data-theme="<name>"]`,
 * and its values underneath, for `from`, `resolve` and `adoptTheme`.
 */
export type Theme<D> = Sheet & Defined<D>

/** The type of group `G` of the tokens `D`: known by its name, or stated with `typed`. */
type TypeOf<D, G extends keyof D> = G extends KnownGroup
  ? (typeof GROUP_TYPES)[G]
  : D[G] extends TypedGroup<infer T, any>
    ? T
    : never

/** What a theme may change: tokens that exist, each with a value of its group's type. */
export type ThemeChanges<D> = {
  readonly [G in keyof D]?: {
    readonly [N in keyof NamesOf<D[G]>]?:
      TokenValues[TypeOf<D, G> & TokenType] | Reference
  }
}

/** The groups of the tokens `D` whose type is colour. */
type ColorGroup<D> = {
  [G in keyof D & string]: TypeOf<D, G> extends 'color' ? G : never
}[keyof D & string]

/**
 * What a contrast pair may name: a token of the `color` group by its name
 * (`text`), or of any colour group as `group.name` (`brand.ink`).
 */
export type ColorName<D> =
  | (D extends { readonly color: infer C }
      ? `${keyof NamesOf<C> & (string | number)}`
      : never)
  | {
      [G in ColorGroup<D>]: `${G}.${keyof NamesOf<D[G]> & (string | number)}`
    }[ColorGroup<D>]

/** A pair to check: `['on-primary', 'primary', 'text']`. */
export type ContrastPair<D> = readonly [
  foreground: ColorName<D>,
  background: ColorName<D>,
  use: ContrastUse,
]

/** `defineTheme`'s options, beside the groups it changes. */
export type ThemeOptions<D> = {
  /** The theme this one changes; without it, the tokens' own values. */
  readonly from?: Theme<D>
  /**
   * Fixes `color-scheme`, or `inherit` takes the room around it's; without
   * it the theme keeps its base's, else follows the system.
   */
  readonly colorScheme?: ThemeScheme
  /** More pairs to check, besides the tokens' and the base theme's. */
  readonly contrastChecks?: readonly ContrastPair<D>[]
} & ThemeChanges<D>

/**
 * Another set of values for the same tokens, on any element with
 * `data-theme="<name>"`, nested or not. It writes only what changes over
 * its base — `from`, or the tokens' own values — and glyph merges them, so
 * the CSS carries every value and the theme looks the same wherever it
 * sits. The rule also sets `color` and `background-color` from
 * `--color-text` and `--color-surface` when the tokens have them: an
 * inherited colour is resolved where it is set, so a room needs its own.
 * A wrong value or a pair that falls short throws, naming each.
 *
 *   const night = defineTheme(tokens, 'night', {
 *     colorScheme: 'dark',
 *     color: { surface: '#111', text: '#eee' },
 *   })
 *   const dusk = defineTheme(tokens, 'dusk', { from: night, color: { surface: '#223' } })
 *   static styles = [tokens, night, dusk]
 *   <section data-theme="dusk">…</section>
 */
export function defineTheme<D>(
  tokens: Defined<D>,
  name: string,
  options: ThemeOptions<NoInfer<D>> = {},
): Theme<D> {
  const draft = draftOf(tokens, name, options)
  const problems = draft.messages()
  if (problems.length > 0)
    throw new Error(
      `glyph: theme ${JSON.stringify(name)}: ${problems.join('; ')}`,
    )
  return draft.theme()
}

/** The options split into the base, the pairs and the changes to the groups. */
function draftOf<D>(
  tokens: Defined<D>,
  name: string,
  options: ThemeOptions<D>,
): ThemeDraft<D> {
  const {
    from = tokens,
    colorScheme,
    contrastChecks = [],
    ...changes
  } = options
  const parts = { name, colorScheme, checks: contrastChecks, changes }
  const sets = { tokens: tokens[DEFINITION], base: from[DEFINITION] }
  return new ThemeDraft<D>(sets, parts, codeValue)
}

/** What a theme was written with, before anything is checked. */
export interface ThemeParts {
  readonly name: unknown
  readonly colorScheme: unknown
  readonly checks: readonly ContrastCheck[]
  readonly changes: Readonly<Record<string, unknown>>
}

/**
 * A theme on its way, for `defineTheme` and `themeFrom`: what was written,
 * checked against its base before it becomes CSS. `check` says how a value
 * is checked — by kind in code, read as a colour when a person typed it.
 */
export class ThemeDraft<D> {
  private readonly tokens: TokenSet<D>
  private readonly base: TokenSet<D>

  /** `tokens` are the ones the theme is for; `base`, what it changes (them, or `from`). */
  constructor(
    sets: { tokens: TokenSet<D>; base: TokenSet<D> },
    private readonly parts: ThemeParts,
    private readonly check: ValueCheck,
  ) {
    this.tokens = sets.tokens
    this.base = sets.base
  }

  /** A person's mistakes, for `themeFrom`; the contrast is measured once the rest is right. */
  errors(): ThemeError[] {
    const written = this.written()
    if (written.length > 0) return written
    const cycles = referenceCycles(this.merged(), this.changedPaths())
    if (cycles.length > 0) return cycles
    return contrastShortfalls(this.merged()).map(asError)
  }

  /** `color.surface`, … : each token the theme sets. */
  private changedPaths(): string[] {
    const groups = this.parts.changes as Record<string, Record<string, unknown>>
    return Object.entries(groups).flatMap(([group, tokens]) =>
      Object.keys(tokens).map((token) => `${group}.${token}`),
    )
  }

  /** The same in code, as lines, with the pairs' own mistakes too. */
  messages(): string[] {
    if (this.base.origin !== this.tokens.origin) return [OTHER_TOKENS]
    const written = [
      ...this.written().map((error) => error.message),
      ...checkProblems(this.base, this.parts.checks),
    ]
    if (written.length > 0) return written
    return contrastShortfalls(this.merged()).map(lineOf)
  }

  /** The theme, once `problems()` is empty. */
  theme(): Theme<D> {
    const set = this.merged()
    const name = this.parts.name as string
    const lines = [schemeDeclaration(set, this.tokens), ...set.declarations()]
    const own = themeSheet(name, [...lines, ...surfaceDeclarations(set)])
    return Object.freeze({ ...own, [DEFINITION]: set })
  }

  private written(): ThemeError[] {
    const { name, colorScheme, changes } = this.parts
    return [
      ...nameProblems(name),
      ...schemeProblems(colorScheme),
      ...changeProblems(this.base, changes, this.check),
    ]
  }

  private merged(): TokenSet<D> {
    const { colorScheme, checks, changes } = this.parts
    const scheme = colorScheme as ThemeScheme | undefined
    const groups = changes as Record<string, Record<string, unknown>>
    return this.base.with(groups, { checks, colorScheme: scheme })
  }
}

/**
 * TS stops a `from` of other tokens; without TS only this does: the theme
 * would write the other tokens' properties, and every other line would
 * describe the wrong tokens, so it is said alone.
 */
const OTHER_TOKENS =
  'from is a theme of other tokens; make it from the same tokens object'

/** `[data-theme="<name>"]` in `glyph.themes`, named after the theme so a page emits it once. */
function themeSheet(name: string, lines: readonly string[]): Sheet {
  const selector = `[data-theme="${cssString(name)}"]`
  return sheet(`glyph.themes(${name})`, 'glyph.themes', rule(selector, lines))
}

/**
 * Always written, so a room takes its scheme from the room around it only
 * when it says `inherit`: the one it says, else what the tokens
 * write on `:root` — `light dark` when a colour is `light-dark()` — else
 * `normal`, the page's own default.
 */
function schemeDeclaration(set: TokenSet, tokens: TokenSet): string {
  const follows = set.hasLightDark() || tokens.hasLightDark()
  const scheme = set.colorScheme ?? (follows ? 'light dark' : 'normal')
  return `color-scheme: ${scheme};`
}

/**
 * The text and surface colours, set again where the theme is: `color` is
 * inherited already resolved, so without this a nested room would show its
 * parent's text. Left out when the tokens have no such colour.
 */
function surfaceDeclarations(set: TokenSet): string[] {
  const color = set.group('color')
  return [
    ...(color?.has('text') ? ['color: var(--color-text);'] : []),
    ...(color?.has('surface')
      ? ['background-color: var(--color-surface);']
      : []),
  ]
}

/**
 * Any text names a theme: `modo noche` too. Only empty text can't,
 * since `data-theme=""` is an element with no theme.
 */
function nameProblems(name: unknown): ThemeError[] {
  if (typeof name === 'string' && name !== '') return []
  const message = `name: ${JSON.stringify(name)} can't be a theme name; write some text, such as "night"`
  return [{ path: 'name', code: 'badName', data: { value: name }, message }]
}

/**
 * A person's JSON holds no references and only colours glyph reads, so
 * every pair can be measured; a line here means the tokens themselves are
 * wrong, a mistake in code.
 */
function asError(shortfall: ThemeError | string): ThemeError {
  if (typeof shortfall !== 'string') return shortfall
  throw new Error(`glyph: the tokens can't be measured: ${shortfall}`)
}

const SCHEMES: readonly ThemeScheme[] = ['light', 'dark', 'inherit']

function schemeProblems(scheme: unknown): ThemeError[] {
  if (scheme === undefined || SCHEMES.includes(scheme as ThemeScheme)) return []
  const message = `colorScheme: ${JSON.stringify(scheme)} is not "light", "dark" or "inherit"`
  const data = { value: scheme, allowed: SCHEMES }
  return [{ path: 'colorScheme', code: 'badColorScheme', data, message }]
}
