import { sheet, type Sheet } from './sheet'
import { groupFrom, type TokenGroup } from './token-group'
import type {
  GROUP_TYPES,
  GroupOf,
  KnownGroup,
  TokenType,
  TypedGroup,
} from './typed'

type Reserved = 'css' | 'name'

/** The message TS shows for a group it can't type (B.3). */
type UnknownGroup<G extends string> =
  `glyph: "${G}" is not a known token group (color, space, size, radius, font, weight, shadow, duration, easing, z); say its type: ${G}: typed('color', { … })`

type ReservedGroup<G extends string> =
  `glyph: a token group can't be called "${G}": the tokens keep .css and .name for their sheet`

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

type NamesOf<V> = V extends TypedGroup<TokenType, infer N> ? N : V

/** Each token read as `var(--<group>-<name>)`, the exact string it is. */
type Leaves<G extends string, N> = {
  readonly [K in keyof N & (string | number)]: `var(--${G}-${K})`
}

/** What `defineTokens` returns: the groups' leaves, and the sheet that defines them. */
export type Tokens<D> = {
  readonly [G in keyof D & string]: Leaves<G, NamesOf<D[G]>>
} & Sheet

/**
 * Tokens as custom properties by one visible rule, `--<group>-<name>`
 * (B.1). Each leaf of the result is the `var()` that reads its token, the
 * result is also the sheet that defines them on `:root`, in the
 * `glyph.tokens` layer. A token may point to another (B.2); a colour may be
 * `{ light, dark }`, emitted as `light-dark()` with `color-scheme` (C.3).
 *
 *   const palette = defineTokens({ blue: typed('color', { 500: '#3b82f6' }) })
 *   const tokens = defineTokens({
 *     color: { primary: palette.blue[500], text: { light: '#222', dark: '#eee' } },
 *     space: { m: '1rem' },
 *   })
 *   tokens.color.primary // 'var(--color-primary)'
 *   tokens.css           // … :root { color-scheme: light dark; --color-primary: var(--blue-500); … }
 *   static styles = [palette, tokens]
 */
export function defineTokens<const D extends Checked<D>>(groups: D): Tokens<D> {
  const table = Object.entries(groups).map(([name, value]) =>
    groupFrom(name, value),
  )
  const leaves = table.map((group) => [
    group.name,
    Object.freeze(group.references()),
  ])
  return Object.freeze({ ...Object.fromEntries(leaves), ...tokenSheet(table) })
}

/**
 * Named after its groups, so two token objects (a palette and its meanings)
 * stay two sheets, and the same groups twice are one.
 */
function tokenSheet(table: TokenGroup[]): Sheet {
  const name = `glyph.tokens(${table.map((group) => group.name).join(', ')})`
  const scheme = table.some((group) => group.hasLightDark())
  const lines = [
    ...(scheme ? ['color-scheme: light dark;'] : []), // light-dark() follows it (C.3)
    ...table.flatMap((group) => group.declarations()),
  ]
  return sheet(name, 'glyph.tokens', rootRule(lines))
}

function rootRule(declarations: string[]): string {
  return `:root {\n${declarations.map((d) => `  ${d}`).join('\n')}\n}`
}
