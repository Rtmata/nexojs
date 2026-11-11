import { checkProblems, contrastShortfalls } from './contrast-checks'
import type { ContrastUse } from './color/contrast'
import { rule, sheet, type Sheet } from './sheet'
import { CSS_NAME } from './token-group'
import {
  DEFINITION,
  type ContrastCheck,
  type Defined,
  type ThemeScheme,
  type TokenSet,
} from './token-set'
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
 * A theme (C.1): a sheet that sets every token under `[data-theme="<name>"]`,
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

/** A pair to check: `['on-primary', 'primary', 'text']` (C.5). */
export type ContrastPair<D> = readonly [
  foreground: ColorName<D>,
  background: ColorName<D>,
  use: ContrastUse,
]

/** `defineTheme`'s options, beside the groups it changes. */
export type ThemeOptions<D> = {
  /** The theme this one changes; without it, the tokens' own values (C.2). */
  readonly from?: Theme<D>
  /**
   * Fixes `color-scheme`, or `inherit` takes the room around it's; without
   * it the theme keeps its base's, else follows the system (C.3).
   */
  readonly colorScheme?: ThemeScheme
  /** More pairs to check, besides the tokens' and the base theme's (C.5). */
  readonly contrastChecks?: readonly ContrastPair<D>[]
} & ThemeChanges<D>

/**
 * Another set of values for the same tokens (C.1–C.3), on any element with
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
  const problems = draft.problems()
  if (problems.length > 0)
    throw new Error(`glyph: theme "${name}": ${problems.join('; ')}`)
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

  /** Every mistake, one line each; the contrast is measured once the rest is right. */
  problems(): string[] {
    const { name, colorScheme, checks, changes } = this.parts
    const written = [
      ...nameProblems(name),
      ...schemeProblems(colorScheme),
      ...changeProblems(this.base, changes, this.check),
      ...checkProblems(this.base, checks),
    ]
    return written.length > 0 ? written : contrastShortfalls(this.merged())
  }

  /** The theme, once `problems()` is empty. */
  theme(): Theme<D> {
    const set = this.merged()
    const name = this.parts.name as string
    const lines = [schemeDeclaration(set, this.tokens), ...set.declarations()]
    const own = themeSheet(name, [...lines, ...surfaceDeclarations(set)])
    return Object.freeze({ ...own, [DEFINITION]: set })
  }

  private merged(): TokenSet<D> {
    const { colorScheme, checks, changes } = this.parts
    const scheme = colorScheme as ThemeScheme | undefined
    const groups = changes as Record<string, Record<string, unknown>>
    return this.base.with(groups, { checks, colorScheme: scheme })
  }
}

/** `[data-theme="<name>"]` in `glyph.themes`, named after the theme so a page emits it once. */
function themeSheet(name: string, lines: readonly string[]): Sheet {
  const selector = `[data-theme="${name}"]`
  return sheet(`glyph.themes(${name})`, 'glyph.themes', rule(selector, lines))
}

/**
 * Always written, so a room takes its scheme from the room around it only
 * when it says `inherit` (C.2): the one it says (C.3), else what the tokens
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

function nameProblems(name: unknown): string[] {
  if (typeof name === 'string' && CSS_NAME.test(name)) return []
  return [
    `name: ${JSON.stringify(name)} can't be a theme name; use letters, digits, - and _, such as "night"`,
  ]
}

function schemeProblems(scheme: unknown): string[] {
  if ([undefined, 'light', 'dark', 'inherit'].includes(scheme as string))
    return []
  return [
    `colorScheme: ${JSON.stringify(scheme)} is not "light", "dark" or "inherit"`,
  ]
}
