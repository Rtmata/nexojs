/** A value a declaration may hold: CSS text, or a number written as it is. */
export type CssValue = string | number

/**
 * Declarations with CSS's own property names (kebab-case, C.20b), and rules
 * nested by CSS's own selectors as keys (`'&:hover'`, `'@media (…)'`,
 * D.3), written as native CSS nesting.
 */
export interface StyleBlock {
  readonly [key: string]: CssValue | StyleBlock
}

/** `&…` and `@…` keys open a nested rule; any other key is a property. */
export function isNested(key: string): boolean {
  return key.startsWith('&') || key.startsWith('@')
}

/** A property name CSS reads: `color`, `-webkit-line-clamp`, `--x`. */
const PROPERTY = /^-{0,2}[a-z][a-z0-9-]*$/

/** What would end a declaration, the rule, or the `<style>` around it. */
const BREAKS_OUT = /[;{}\n\r]|<\/style/i

/**
 * A block as lines, nested rules indented inside their own braces. `name`
 * turns a key into the property written — as written for a style, `--<recipe>-<var>`
 * for a variant's vars — or says why it can't be one.
 */
export function blockLines(
  block: StyleBlock,
  name: (key: string) => string,
  where: string,
): string[] {
  return Object.entries(block).flatMap(([key, value]) =>
    isNested(key)
      ? nestedLines(key, value, name, where)
      : [`${name(key)}: ${valueText(value, `${where} ${key}`)};`],
  )
}

function nestedLines(
  key: string,
  value: CssValue | StyleBlock,
  name: (key: string) => string,
  where: string,
): string[] {
  if (BREAKS_OUT.test(key))
    throw new Error(`glyph: ${where}: "${key}" can't be a selector here`)
  if (typeof value !== 'object')
    throw new Error(
      `glyph: ${where} ${key}: a nested rule holds an object of declarations`,
    )
  return ruleLines(key, blockLines(value, name, `${where} ${key}`))
}

/** `selector {`, the lines indented, `}`. */
export function ruleLines(
  selector: string,
  lines: readonly string[],
): string[] {
  return [`${selector} {`, ...lines.map((line) => `  ${line}`), '}']
}

/** A style's property as written, once it is one CSS reads. */
export function propertyName(where: string): (key: string) => string {
  return (key) => {
    if (PROPERTY.test(key)) return key
    throw new Error(
      `glyph: ${where}: "${key}" is not a CSS property; write CSS's own name in kebab-case, such as "font-size", or nest with "&…" / "@…"`,
    )
  }
}

/** A value, once it stays inside its declaration. */
export function valueText(value: unknown, where: string): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string' && !BREAKS_OUT.test(value)) return value
  throw new Error(
    `glyph: ${where}: ${JSON.stringify(value)} can't be a CSS value here; write text without ; { } or line breaks, or a number`,
  )
}
