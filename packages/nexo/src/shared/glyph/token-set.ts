import type { ContrastUse } from './color/contrast'
import type { TokenGroup } from './token-group'
import type { TokenType } from './typed'

/** Light or dark: what CSS's `color-scheme` picks, and `light-dark()` with it (C.3). */
export type ColorScheme = 'light' | 'dark'

/**
 * What a theme may say of its scheme: one fixed, or `inherit`, CSS's own
 * word, to take the scheme of the room around it (C.3).
 */
export type ThemeScheme = ColorScheme | 'inherit'

/**
 * A pair to check (C.5): foreground and background, names in the `color`
 * group, and what the foreground is — `text` needs 4.5:1 (WCAG 2.2 1.4.3),
 * `ui` 3:1 (1.4.11).
 */
export type ContrastCheck = readonly [
  foreground: string,
  background: string,
  use: ContrastUse,
]

/** A token found by its property name: its group's type, its value as written. */
export interface Found {
  readonly type: TokenType
  readonly value: unknown
}

/**
 * Where tokens and themes keep their definitions. A symbol, so no group
 * name can clash with it and it never shows among the leaves; it is still
 * a plain property, visible in a debugger.
 */
export const DEFINITION = Symbol('glyph: definition')

/** What tokens and themes are underneath: values to merge, check and resolve. */
export interface Defined<D> {
  readonly [DEFINITION]: TokenSet<D>
}

/**
 * The values behind a token object or a theme: its groups, the pairs whose
 * contrast it keeps, the token objects its references point into, and the
 * scheme it fixes, if any. Themes are new sets made by `with` (C.2): a set
 * never changes.
 */
export class TokenSet<D = unknown> {
  /** Type only, never set: the groups as written, so TS checks a theme against them. */
  declare readonly shape?: D

  constructor(
    readonly groups: readonly TokenGroup[],
    readonly checks: readonly ContrastCheck[],
    readonly refersTo: readonly TokenSet[],
    readonly colorScheme?: ThemeScheme,
    private readonly made?: TokenSet,
  ) {}

  /** The token object's set every theme of it was made from: itself, for tokens. */
  get origin(): TokenSet {
    return this.made ?? this
  }

  /** The scheme it always shows, if any: `inherit` may show either. */
  fixedScheme(): ColorScheme | undefined {
    return this.colorScheme === 'inherit' ? undefined : this.colorScheme
  }

  group(name: string): TokenGroup | undefined {
    return this.groups.find((group) => group.name === name)
  }

  groupNames(): string[] {
    return this.groups.map((group) => group.name)
  }

  /** Every property it defines, without `--`: `color-primary`. */
  properties(): string[] {
    return this.groups.flatMap((group) =>
      group.tokenNames().map((token) => `${group.name}-${token}`),
    )
  }

  /** Every property a reference may name: its own, then its palettes'. */
  knownProperties(): string[] {
    const referred = this.refersTo.flatMap((set) => set.knownProperties())
    return [...this.properties(), ...referred]
  }

  /**
   * The token behind `--<property>`: its own first, then the token objects
   * it refers to, as a custom property set nearer wins in CSS.
   */
  find(property: string): Found | undefined {
    const own = this.groups.map((group) => foundIn(group, property))
    const referred = this.refersTo.map((set) => set.find(property))
    return [...own, ...referred].find((found) => found !== undefined)
  }

  /** One custom property per token. */
  declarations(): string[] {
    return this.groups.flatMap((group) => group.declarations())
  }

  /** Whether a colour depends on the scheme: `light-dark()` needs `color-scheme` (C.3). */
  hasLightDark(): boolean {
    return this.groups.some((group) => group.hasLightDark())
  }

  /** A new set: `changes` over these values, more pairs, maybe a fixed scheme (C.2). */
  with(
    changes: Readonly<Record<string, Readonly<Record<string, unknown>>>>,
    more: { checks: readonly ContrastCheck[]; colorScheme?: ThemeScheme },
  ): TokenSet<D> {
    const changed = (g: TokenGroup) =>
      Object.hasOwn(changes, g.name) ? g.with(changes[g.name]!) : g
    const groups = this.groups.map(changed)
    const checks = [...this.checks, ...more.checks.filter(this.isNew, this)]
    const scheme = more.colorScheme ?? this.colorScheme
    return new TokenSet(groups, checks, this.refersTo, scheme, this.origin)
  }

  private isNew(check: ContrastCheck): boolean {
    return !this.checks.some((known) => known.join() === check.join())
  }
}

function foundIn(group: TokenGroup, property: string): Found | undefined {
  const token = property.slice(group.name.length + 1)
  if (!property.startsWith(`${group.name}-`) || !group.has(token))
    return undefined
  return { type: group.type, value: group.valueOf(token) }
}
