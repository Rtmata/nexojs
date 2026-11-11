import { checkProblems, contrastShortfalls } from './contrast-checks'
import { rule, sheet, type Sheet } from './sheet'
import type { ContrastPair } from './theme'
import { groupFrom, type TokenGroup } from './token-group'
import {
  DEFINITION,
  TokenSet,
  type ContrastCheck,
  type Defined,
} from './token-set'
import type {
  GROUP_TYPES,
  GroupOf,
  KnownGroup,
  TokenType,
  TypedGroup,
} from './typed'

type Reserved = 'css' | 'name' | 'from' | 'colorScheme' | 'contrastChecks'

/** The message TS shows for a group it can't type (B.3). */
type UnknownGroup<G extends string> =
  `glyph: "${G}" is not a known token group (color, space, size, radius, font, weight, shadow, duration, easing, z); say its type: ${G}: typed('color', { … })`

type ReservedGroup<G extends string> =
  `glyph: a token group can't be called "${G}": the tokens keep .css and .name for their sheet, and defineTheme reads from, colorScheme and contrastChecks as options`

/** What each group of `D` must be: its known type, a `typed` group, or an error that says why. */
export type Checked<D> = {
  [G in keyof D]: G extends Reserved
    ? ReservedGroup<G>
    : G extends KnownGroup
      ? GroupOf<(typeof GROUP_TYPES)[G]>
      : D[G] extends TypedGroup<TokenType, infer N>
        ? TypedGroup<TokenType, N>
        : UnknownGroup<G & string>
}

/** A group's token names: its own keys, or a `typed` group's. */
export type NamesOf<V> = V extends TypedGroup<TokenType, infer N> ? N : V

/** Each token read as `var(--<group>-<name>)`, the exact string it is. */
type Leaves<G extends string, N> = {
  readonly [K in keyof N & (string | number)]: `var(--${G}-${K})`
}

/**
 * What `defineTokens` returns: the groups' leaves, the sheet that defines
 * them, and its values underneath, for themes and `resolve`.
 */
export type Tokens<D> = {
  readonly [G in keyof D & string]: Leaves<G, NamesOf<D[G]>>
} & Sheet &
  Defined<D>

/** `defineTokens`' options. */
export interface TokenOptions<D> {
  /**
   * Pairs whose contrast these tokens keep (C.5), checked now and in
   * every theme made from them: `[['on-primary', 'primary', 'text']]`.
   * A name is a token of `color`; `brand.ink` names one of another colour
   * group of these tokens.
   */
  readonly contrastChecks?: readonly ContrastPair<D>[]
  /**
   * The token objects these tokens' references point into (a palette), so
   * glyph can follow them to a final value: for contrast and `resolve`.
   * The CSS doesn't need it: the browser follows `var()` itself.
   */
  readonly refersTo?: readonly Defined<unknown>[]
}

/**
 * Tokens as custom properties by one visible rule, `--<group>-<name>`
 * (B.1). Each leaf of the result is the `var()` that reads its token, the
 * result is also the sheet that defines them on `:root`, in the
 * `glyph.tokens` layer. A token may point to another (B.2); a colour may be
 * `{ light, dark }`, emitted as `light-dark()` with `color-scheme` (C.3).
 * Pairs in `contrastChecks` that fall short throw, naming each (C.5).
 *
 *   const palette = defineTokens({ blue: typed('color', { 500: '#3b82f6' }) })
 *   const tokens = defineTokens(
 *     {
 *       color: { primary: palette.blue[500], 'on-primary': '#fff', text: { light: '#222', dark: '#eee' } },
 *       space: { m: '1rem' },
 *     },
 *     { contrastChecks: [['on-primary', 'primary', 'text']], refersTo: [palette] },
 *   )
 *   tokens.color.primary // 'var(--color-primary)'
 *   tokens.css           // … :root { color-scheme: light dark; --color-primary: var(--blue-500); … }
 *   static styles = [palette, tokens]
 */
export function defineTokens<const D extends Checked<D>>(
  groups: D,
  options: TokenOptions<NoInfer<D>> = {},
): Tokens<D> {
  const table = Object.entries(groups).map(([name, value]) =>
    groupFrom(name, value),
  )
  return tokenObject(table, checkedSet(table, options)) as Tokens<D>
}

/** The leaves of each group, the sheet, and the values underneath: one frozen object. */
function tokenObject(table: TokenGroup[], set: TokenSet): object {
  const leaves = table.map((group) => [
    group.name,
    Object.freeze(group.references()),
  ])
  const own = tokenSheet(table, set)
  return Object.freeze({
    ...Object.fromEntries(leaves),
    ...own,
    [DEFINITION]: set,
  })
}

/** The tokens' values, once their pairs name real colours that reach the contrast asked. */
function checkedSet(
  table: TokenGroup[],
  options: {
    readonly contrastChecks?: readonly ContrastCheck[]
    readonly refersTo?: readonly Defined<unknown>[]
  },
): TokenSet {
  const { contrastChecks = [], refersTo = [] } = options
  const referred = refersTo.map((tokens) => tokens[DEFINITION])
  const set = new TokenSet(table, contrastChecks, referred)
  const named = checkProblems(set, contrastChecks)
  const problems = named.length > 0 ? named : contrastShortfalls(set)
  if (problems.length > 0) throw new Error(`glyph: ${problems.join('; ')}`)
  return set
}

/**
 * Named after its groups, so two token objects (a palette and its meanings)
 * stay two sheets, and the same groups twice are one.
 */
function tokenSheet(table: TokenGroup[], set: TokenSet): Sheet {
  const name = `glyph.tokens(${table.map((group) => group.name).join(', ')})`
  const scheme = set.hasLightDark() ? ['color-scheme: light dark;'] : [] // light-dark() follows it (C.3)
  const lines = [...scheme, ...set.declarations()]
  return sheet(name, 'glyph.tokens', rule(':root', lines))
}
