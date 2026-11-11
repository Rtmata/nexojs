/**
 * What a token can be (B.3). The type names are DTCG 2025.10's `$type`s,
 * so the DTCG piece can write them out as they are.
 */
export interface TokenValues {
  /** Any CSS colour, or one per colour scheme: emitted as `light-dark()` (C.3). */
  color: string | LightDark
  dimension: string
  fontFamily: string
  fontWeight: number | string
  shadow: string
  /** Milliseconds, as every time in Nexo: `150` is emitted as `150ms`. */
  duration: number
  /** Any CSS easing: `ease-out`, `cubic-bezier(…)`, `linear(…)`. */
  cubicBezier: string
  number: number
}

export type TokenType = keyof TokenValues

/** A colour for each scheme; the page's `color-scheme` picks one. */
export interface LightDark {
  readonly light: string
  readonly dark: string
}

/** Another token, the leaf of a token object: a token may point to one (B.2). */
export type Reference = `var(--${string})`

/** A group's tokens: name → value of its type, or a reference. */
export type GroupOf<T extends TokenType> = {
  readonly [name: string]: TokenValues[T] | Reference
}

/**
 * The groups whose type is known by their name (B.3). Any other group says
 * its type with `typed`.
 */
export const GROUP_TYPES = {
  color: 'color',
  space: 'dimension',
  size: 'dimension',
  radius: 'dimension',
  font: 'fontFamily',
  weight: 'fontWeight',
  shadow: 'shadow',
  duration: 'duration',
  easing: 'cubicBezier',
  z: 'number',
} as const satisfies Record<string, TokenType>

export type KnownGroup = keyof typeof GROUP_TYPES

/** A group that states its type; made by `typed`. */
export class TypedGroup<T extends TokenType, N extends GroupOf<T>> {
  constructor(
    readonly type: T,
    readonly tokens: N,
  ) {}
}

/**
 * A token group whose name isn't one of the known ones, with its type
 * (B.3): the type says what the values are, so a value of another kind is
 * a TS error.
 *
 *   const palette = defineTokens({ blue: typed('color', { 500: '#3b82f6' }) })
 *   palette.blue[500] // 'var(--blue-500)'
 */
export function typed<T extends TokenType, const N extends GroupOf<T>>(
  type: T,
  tokens: N,
): TypedGroup<T, N> {
  return new TypedGroup(type, tokens)
}
