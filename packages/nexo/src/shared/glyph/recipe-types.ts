import type { Sheet } from './sheet'
import type { CssValue, StyleBlock } from './style-block'

/** A recipe's vars and their default values (D.1): `{ bg: tokens.color.surface }`. */
export type Vars = Readonly<Record<string, CssValue>>

/** Each var as the `var()` that reads it, for `base` and `parts`: `v.bg` is `'var(--button-bg)'`. */
export type VarReads<V> = {
  readonly [K in keyof V & string]: `var(--${string})`
}

type Nested = `&${string}` | `@${string}`

/**
 * What a variant (or a `when`'s `set`) may write: vars of the recipe, and
 * nested rules of the same (D.3). Anything else is a TS error that says so.
 */
export type VarSet<S, V> = {
  readonly [K in keyof S]: K extends keyof V
    ? CssValue
    : K extends Nested
      ? VarSet<S[K], V>
      : `glyph: "${K & string}" is not a var of this recipe; its vars are ${keyof V & string}`
}

/** Every group's values, each a `VarSet` checked against the vars. */
export type CheckedVariants<G, V> = {
  readonly [Group in keyof G]: {
    readonly [Value in keyof G[Group]]: VarSet<G[Group][Value], V>
  }
}

/** A value per group, any of them left out: what `defaultVariants`, `when` and a call take. */
export type Choice<G> = {
  readonly [Group in keyof G]?: keyof G[Group] & string
}

/** What a `when`'s `set` may write: vars of the recipe, and nested rules of the same. */
export type WhenSet<V> = { readonly [K in keyof V]?: CssValue } & {
  readonly [K in Nested]?: WhenSet<V>
}

/** A compound variant (D.4): the groups' values it applies to, and the vars it sets. */
export type When<G, V> = Choice<G> & { readonly set: WhenSet<V> }

/** Each part's style, from the recipe's vars (D.5). */
export type Parts<V> = Readonly<
  Record<string, (vars: VarReads<V>) => StyleBlock>
>

/** `recipe`'s second argument. */
export interface RecipeConfig<V extends Vars, G, P> {
  /** The recipe's own custom properties and their defaults: `--<recipe>-<var>`. */
  readonly vars: V
  /** The root's style; `v.bg` reads the var `bg`. */
  readonly base: (vars: VarReads<V>) => StyleBlock
  /** Groups of values; each value changes vars only (D.1). */
  readonly variants?: G
  readonly defaultVariants?: NoInfer<Choice<G>>
  /** "When ghost and small, set pad" (D.4). */
  readonly when?: NoInfer<readonly When<G, V>[]>
  /** Inner parts, reading the root's vars through inheritance (D.5). */
  readonly parts?: {
    readonly [K in keyof P]: (vars: VarReads<V>) => StyleBlock
  }
}

/** What a call gives: the class string, or with parts, one per part and `root`. */
export type RecipeClasses<P> = [keyof P] extends [never]
  ? string
  : { readonly root: string } & { readonly [K in keyof P]: string }

/**
 * A recipe: called with a value per group, it gives the classes (D.2); it
 * is also the sheet a `styles` list names (A.2).
 */
export type Recipe<G, P> = ((choice?: Choice<G>) => RecipeClasses<P>) & Sheet
