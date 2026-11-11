import {
  GROUP_TYPES,
  TypedGroup,
  type LightDark,
  type TokenType,
} from './typed'

/** What may follow `--` in a custom property glyph writes, unescaped. */
const CSS_NAME = /^[A-Za-z0-9_-]+$/

/** The token object keeps these for its sheet: a group can't take them. */
const RESERVED = ['css', 'name']

/** How each type is written in CSS; `undefined` when the value isn't one. */
const WRITERS: Record<TokenType, (value: unknown) => string | undefined> = {
  color: (v) =>
    isLightDark(v) ? `light-dark(${v.light}, ${v.dark})` : text(v),
  dimension: text,
  fontFamily: text,
  fontWeight: (v) => (typeof v === 'number' ? String(v) : text(v)),
  shadow: text,
  duration: (v) => (typeof v === 'number' ? `${v}ms` : reference(v)),
  cubicBezier: text,
  number: (v) => (typeof v === 'number' ? String(v) : reference(v)),
}

/** What each type expects, for the error that names a wrong value. */
const EXPECTED: Record<TokenType, string> = {
  color: 'a CSS colour or { light, dark }',
  dimension: 'a CSS length such as "1rem"',
  fontFamily: 'a font-family list',
  fontWeight: 'a weight such as 400',
  shadow: 'a CSS shadow',
  duration: 'milliseconds as a number, such as 150',
  cubicBezier: 'a CSS easing such as "ease-out"',
  number: 'a number',
}

/**
 * One group of tokens and its type. Each token becomes the custom property
 * `--<group>-<name>`, the one rule (B.1), and is read through `var()` of it.
 */
export class TokenGroup {
  constructor(
    readonly name: string,
    private readonly type: TokenType,
    private readonly tokens: Record<string, unknown>,
  ) {
    checkName(name, `group "${name}"`)
    if (RESERVED.includes(name)) throw new Error(reservedMessage(name))
    for (const token of Object.keys(tokens))
      checkName(token, `${name}.${token}`)
  }

  /** name → `var(--<group>-<name>)`, the leaves of the token object. */
  references(): Record<string, string> {
    const names = Object.keys(this.tokens)
    return Object.fromEntries(names.map((n) => [n, `var(${this.property(n)})`]))
  }

  /** One `--<group>-<name>: value;` per token. */
  declarations(): string[] {
    return Object.entries(this.tokens).map(
      ([token, value]) =>
        `${this.property(token)}: ${this.written(token, value)};`,
    )
  }

  /** Whether a colour depends on the scheme: `light-dark()` needs `color-scheme`. */
  hasLightDark(): boolean {
    return Object.values(this.tokens).some(isLightDark)
  }

  private property(token: string): string {
    return `--${this.name}-${token}`
  }

  private written(token: string, value: unknown): string {
    const css = WRITERS[this.type](value)
    if (css !== undefined) return css
    const shown = JSON.stringify(value)
    throw new Error(
      `glyph: ${this.name}.${token} is ${shown}; a ${this.type} token is ${EXPECTED[this.type]}`,
    )
  }
}

/**
 * The group behind `name: value` in `defineTokens`: a known name gives its
 * type, `typed` states one, anything else is a mistake to fix.
 */
export function groupFrom(name: string, value: unknown): TokenGroup {
  if (value instanceof TypedGroup) return typedGroup(name, value)
  if (Object.hasOwn(GROUP_TYPES, name))
    return new TokenGroup(
      name,
      GROUP_TYPES[name as keyof typeof GROUP_TYPES],
      value as Record<string, unknown>,
    )
  throw new Error(unknownGroupMessage(name))
}

function unknownGroupMessage(name: string): string {
  const known = Object.keys(GROUP_TYPES).join(', ')
  return `glyph: "${name}" is not a known token group (${known}); say its type: ${name}: typed('color', { … })`
}

function typedGroup(
  name: string,
  group: TypedGroup<TokenType, {}>,
): TokenGroup {
  if (!Object.hasOwn(WRITERS, group.type))
    throw new Error(
      `glyph: typed('${group.type}', …) for "${name}": the types are ${Object.keys(WRITERS).join(', ')}`,
    )
  return new TokenGroup(name, group.type, group.tokens)
}

function checkName(name: string, where: string): void {
  if (CSS_NAME.test(name)) return
  throw new Error(
    `glyph: ${where} can't be part of a CSS custom property name; use letters, digits, - and _`,
  )
}

function reservedMessage(name: string): string {
  return `glyph: a token group can't be called "${name}": the tokens keep .css and .name for their sheet`
}

function isLightDark(value: unknown): value is LightDark {
  return (
    typeof value === 'object' &&
    value !== null &&
    'light' in value &&
    'dark' in value
  )
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function reference(value: unknown): string | undefined {
  return typeof value === 'string' && value.startsWith('var(--')
    ? value
    : undefined
}
