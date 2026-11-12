import { cssString } from '../css-string'
import { round } from '../grammar/numbers'
import { isRecord as isJson } from '../theme-values'
import { CSS_NAME } from '../token-group'
import { defineTokens, type Tokens } from '../tokens'
import { GROUP_TYPES, typed, type TokenType } from '../typed'
import { DTCG_TYPE, Mistakes, WEIGHT_WORDS, type Json } from './common'

/** What `readDtcg` gives: token objects whose groups are known only when the file is read. */
export type DtcgTokens = Tokens<Record<string, Record<string, unknown>>>

/** One token found in the file: where, the types it says or inherits, and its value as written. */
interface Found {
  readonly path: string[]
  readonly own?: string
  readonly inherited?: string
  readonly value: unknown
}

/** A token ready for its glyph group. */
interface Placed {
  readonly name: string
  readonly value: unknown
  readonly type: TokenType
}

/** DTCG's `$type`s glyph has a type for, back to glyph's names. */
const GLYPH_TYPE = Object.fromEntries(
  Object.entries(DTCG_TYPE).map(([glyph, dtcg]) => [dtcg, glyph]),
) as Record<string, TokenType>

/** CSS's generic families: written bare, every other name quoted. */
const GENERIC_FAMILIES = new Set([
  ...['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui'],
  ...['ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'emoji'],
  ...['math', 'fangsong'],
])

/**
 * DTCG 2025.10 JSON as glyph's tokens: a token file, or a resolver
 * whose modifier has `light` and `dark` contexts — those colours become
 * `{ light, dark }`. A top-level group is a glyph group; deeper levels join
 * with `-` (`color.blue.500` → `--color-blue-500`). References, `{a.b}` or
 * a `$ref` to a whole token, stay references. What glyph has no form for
 * (`$extends`, a `$ref` to part of a value, a gradient, a file a resolver
 * points to) is a mistake: all of them are thrown in one message.
 *
 *   const tokens = readDtcg(JSON.parse(await Bun.file('tokens.json').text()))
 */
export function readDtcg(json: unknown): DtcgTokens {
  const reader = new DtcgReader()
  const groups = reader.groups(json)
  reader.mistakes.throwIfAny()
  return defineTokens(groups as never) as unknown as DtcgTokens // a file's names: TS can't know them
}

class DtcgReader {
  readonly mistakes = new Mistakes('readDtcg')
  private found = new Map<string, Found>()

  /** The file's tokens grouped as glyph wants them, ready for `defineTokens`. */
  groups(json: unknown): Record<string, unknown> {
    if (!isJson(json))
      return this.mistakes.add('the file is not a JSON object') ?? {}
    let dark: Map<string, unknown> | undefined
    if ('resolutionOrder' in json) dark = this.resolver(json)
    else this.walk(json, [], undefined)
    const byGroup = new Map<string, Placed[]>()
    for (const token of this.found.values()) {
      const placed = this.placed(token, dark)
      const group = token.path[0]!
      if (placed) byGroup.set(group, [...(byGroup.get(group) ?? []), placed])
    }
    const groups = [...byGroup].map(([name, tokens]) => [
      name,
      this.group(name, tokens),
    ])
    return Object.fromEntries(groups)
  }

  /** A resolver: its sets in order; a light/dark modifier gives each colour its dark side. */
  private resolver(json: Json): Map<string, unknown> | undefined {
    const order = Array.isArray(json.resolutionOrder)
      ? json.resolutionOrder
      : []
    let dark: Map<string, unknown> | undefined
    for (const item of order) {
      const target = pointed(json, item)
      if (isJson(target) && Array.isArray(target.sources))
        for (const source of target.sources) this.source(json, source)
      else if (isJson(target) && isJson(target.contexts))
        dark = this.modifier(json, target.contexts)
      else
        this.mistakes.add(
          `resolutionOrder: ${JSON.stringify(item)} is neither a set nor a modifier glyph can read`,
        )
    }
    return dark
  }

  /** Light read as the tokens' values; dark read apart, kept by path. */
  private modifier(
    json: Json,
    contexts: Json,
  ): Map<string, unknown> | undefined {
    const { light, dark } = contexts
    if (!Array.isArray(light) || !Array.isArray(dark))
      return this.mistakes.add(
        `a modifier with contexts ${Object.keys(contexts).join(', ')}: glyph reads one with light and dark`,
      )
    for (const source of light) this.source(json, source)
    const withLight = this.found
    this.found = new Map(withLight)
    for (const source of dark) this.source(json, source)
    const darkValues = new Map(
      [...this.found].map(([path, token]) => [path, token.value]),
    )
    for (const path of darkValues.keys())
      if (!withLight.has(path))
        this.mistakes.add(
          `${path}: only the dark context has it; glyph needs a light value too`,
        )
    this.found = withLight
    return darkValues
  }

  /** Inline tokens, or a pointer within the resolver; another file can't be read from here. */
  private source(json: Json, source: unknown): void {
    const target = pointed(json, source)
    if (isJson(target) && !('$ref' in target))
      return this.walk(target, [], undefined)
    this.mistakes.add(
      `${JSON.stringify(source)}: glyph reads a resolver's sources inline or within it, not other files; put the tokens inline`,
    )
  }

  /** Every token under `node`, its `$type` inherited from the nearest group that says one. */
  private walk(
    node: Json,
    path: string[],
    inherited: string | undefined,
  ): void {
    const own = typeof node.$type === 'string' ? node.$type : undefined
    if ('$value' in node) {
      this.found.set(path.join('.'), {
        path,
        own,
        inherited,
        value: node.$value,
      })
      return
    }
    if ('$extends' in node)
      this.mistakes.add(
        `${path.join('.') || 'the file'}: $extends isn't read by glyph; write the group's tokens out`,
      )
    for (const [key, child] of Object.entries(node)) {
      if (key.startsWith('$') && key !== '$root') continue
      const next = key === '$root' ? path : [...path, key] // $root is its group's own token
      if (isJson(child)) this.walk(child, next, own ?? inherited)
    }
  }

  /** The token as glyph holds it, or a mistake that says why it can't be. */
  private placed(
    token: Found,
    dark: Map<string, unknown> | undefined,
  ): Placed | undefined {
    const where = token.path.join('.')
    const [group, ...rest] = token.path
    if (!group || rest.length === 0)
      return this.mistakes.add(
        `${where}: a token sits in a group in glyph; put it in one`,
      )
    const name = rest.join('-')
    if (![group, name].every((n) => CSS_NAME.test(n)))
      return this.mistakes.add(
        `${where}: names in glyph use letters, digits, - and _`,
      )
    const dtcgType = this.typeOf(token, new Set())
    const type = own(GLYPH_TYPE, dtcgType)
    if (!type)
      return this.mistakes.add(
        `${where}: glyph has no ${dtcgType ?? 'untyped'} tokens`,
      )
    const light = this.value(type, token.value, where)
    const other = dark?.get(where)
    const same =
      other === undefined ||
      JSON.stringify(other) === JSON.stringify(token.value)
    return {
      name,
      type,
      value: same ? light : this.dual(type, light, other, where),
    }
  }

  /** Its own `$type`, else the type of the token it points to (DTCG §5.2.2), else its group's. */
  private typeOf(token: Found, seen: Set<Found>): string | undefined {
    if (token.own) return token.own
    const path = referencePath(token.value)
    const target = path === undefined ? undefined : this.found.get(path)
    if (target && !seen.has(target)) return this.typeOf(target, seen.add(token))
    return token.inherited
  }

  private dual(
    type: TokenType,
    light: unknown,
    dark: unknown,
    where: string,
  ): unknown {
    if (type !== 'color')
      return this.mistakes.add(
        `${where}: only colours change with the scheme in glyph`,
      )
    return { light, dark: this.value(type, dark, where) }
  }

  /** One glyph group: a known name with its own type, else `typed`. */
  private group(name: string, tokens: Placed[]): unknown {
    const types = [...new Set(tokens.map((t) => t.type))]
    if (types.length > 1)
      return this.mistakes.add(
        `${name}: a glyph group holds one type, this one has ${types.join(' and ')}`,
      )
    const type = types[0]!
    const values = Object.fromEntries(tokens.map((t) => [t.name, t.value]))
    const known = (GROUP_TYPES as Record<string, TokenType>)[name]
    if (known === undefined) return typed(type, values as never) // a file's names: TS can't know them
    if (known === type) return values
    return this.mistakes.add(
      `${name}: in glyph the group ${name} holds ${known} tokens, the file gives ${type}`,
    )
  }

  /** A reference as `var()`, else the value read as its type. */
  private value(type: TokenType, value: unknown, where: string): unknown {
    if (isReference(value)) return this.reference(value, where)
    return this.readers[type](value, where)
  }

  /** `var(--a-b)` for a whole token in the file; a `$ref` into part of a value is a mistake. */
  private reference(value: unknown, where: string): string | undefined {
    const path = referencePath(value)
    if (path === undefined)
      return this.mistakes.add(
        `${where}: a $ref to part of a value (${(value as Json).$ref}) isn't read by glyph; point to a whole token`,
      )
    if (!this.found.has(path))
      return this.mistakes.add(
        `${where}: ${JSON.stringify(value)} points to no token in the file`,
      )
    return `var(--${path.split('.').join('-')})`
  }

  private readonly readers: Record<
    TokenType,
    (value: unknown, where: string) => unknown
  > = {
    color: (v, w) => this.color(v, w),
    dimension: (v, w) =>
      this.measure(v, w, ['px', 'rem'], (n, u) => `${n}${u}`),
    fontFamily: (v, w) => this.families(v, w),
    fontWeight: (v, w) => this.weight(v, w),
    shadow: (v, w) => this.shadow(v, w),
    duration: (v, w) =>
      this.measure(v, w, ['ms', 's'], (n, u) => (u === 's' ? n * 1000 : n)),
    easing: (v, w) => this.curve(v, w),
    number: (v, w) =>
      typeof v === 'number'
        ? v
        : this.mistakes.add(`${w}: a number token holds a JSON number`),
  }

  /** DTCG's colour object as CSS: its hex when given and opaque, else its space's own function. */
  private color(value: unknown, where: string): unknown {
    const { colorSpace, components } = isJson(value) ? value : {}
    if (
      typeof colorSpace !== 'string' ||
      !Array.isArray(components) ||
      components.length !== 3
    )
      return this.mistakes.add(
        `${where}: a colour is { colorSpace, components }`,
      )
    if (!components.every((x) => typeof x === 'number' || x === 'none'))
      return this.mistakes.add(
        `${where}: a colour's components are numbers or none; a $ref inside a value isn't read by glyph`,
      )
    if (!COLOR_SPACES.has(colorSpace))
      return this.mistakes.add(
        `${where}: ${JSON.stringify(colorSpace)} is not one of DTCG's colour spaces`,
      )
    const { alpha, hex } = value as Json
    const over = typeof alpha === 'number' && alpha !== 1 ? ` / ${alpha}` : ''
    if (typeof hex === 'string' && HEX.test(hex) && !over) return hex
    const c = components.map((x) => (x === 'none' ? 'none' : round(Number(x))))
    return colorText(colorSpace, c, over)
  }

  private measure(
    value: unknown,
    where: string,
    units: string[],
    written: (n: number, unit: string) => unknown,
  ): unknown {
    if (
      isJson(value) &&
      typeof value.value === 'number' &&
      units.includes(String(value.unit))
    )
      return written(value.value, String(value.unit))
    return this.mistakes.add(
      `${where}: expected { value, unit } with unit ${units.join(' or ')}`,
    )
  }

  private families(value: unknown, where: string): unknown {
    const names = typeof value === 'string' ? [value] : value
    if (!Array.isArray(names) || !names.every((n) => typeof n === 'string'))
      return this.mistakes.add(
        `${where}: a font family is a name or a list of names`,
      )
    const quoted = (n: string) => `"${cssString(n)}"` // a file's text never leaves its string
    return names
      .map((n) => (GENERIC_FAMILIES.has(n) ? n : quoted(n)))
      .join(', ')
  }

  private weight(value: unknown, where: string): unknown {
    if (typeof value === 'number' && value >= 1 && value <= 1000) return value
    return (
      own(WEIGHT_WORDS, String(value)) ??
      this.mistakes.add(
        `${where}: ${JSON.stringify(value)} is not a DTCG font weight`,
      )
    )
  }

  private curve(value: unknown, where: string): unknown {
    if (
      Array.isArray(value) &&
      value.length === 4 &&
      value.every((n) => typeof n === 'number')
    )
      return `cubic-bezier(${value.join(', ')})`
    return this.mistakes.add(`${where}: a cubicBezier is four numbers`)
  }

  /** One or several shadow objects as CSS; each slot, or a whole layer, may be a reference. */
  private shadow(value: unknown, where: string): unknown {
    const layers = Array.isArray(value) ? value : [value]
    const written = layers.map((layer) => this.layer(layer, where))
    return written.includes(undefined) ? undefined : written.join(', ')
  }

  private layer(layer: unknown, where: string): string | undefined {
    if (isReference(layer)) return this.reference(layer, where)
    if (!isJson(layer))
      return this.mistakes.add(
        `${where}: a shadow is { color, offsetX, offsetY, blur, spread }`,
      )
    const length = (key: string) =>
      this.value('dimension', layer[key] ?? ZERO, `${where}.${key}`)
    const lengths = ['offsetX', 'offsetY', 'blur', 'spread'].map(length)
    const color = this.value('color', layer.color, `${where}.color`)
    const parts = [
      ...(layer.inset === true ? ['inset'] : []),
      ...lengths,
      color,
    ]
    return parts.includes(undefined) ? undefined : parts.join(' ')
  }
}

/** DTCG's blur and spread are optional: a missing one is zero. */
const ZERO = { value: 0, unit: 'px' }

/** DTCG's 6-digit hex, the one form it allows. */
const HEX = /^#[0-9a-f]{6}$/i

/** DTCG 2025.10's colour spaces: anything else never reaches the CSS. */
const COLOR_SPACES = new Set([
  ...['srgb', 'srgb-linear', 'hsl', 'hwb', 'lab', 'lch', 'oklab', 'oklch'],
  ...['display-p3', 'a98-rgb', 'prophoto-rgb', 'rec2020', 'xyz-d65', 'xyz-d50'],
])

/** A CSS function of its own for these spaces; the rest go through `color()`. */
const OWN_FUNCTION = new Set(['lab', 'lch', 'oklab', 'oklch'])

/** The colour as CSS: rgb() for sRGB, percentages where hsl and hwb take them, else the space's function. */
function colorText(space: string, c: unknown[], alpha: string): string {
  const percent = (x: unknown) => (x === 'none' ? x : `${x}%`)
  if (space === 'srgb') {
    const bytes = c.map((x) => (x === 'none' ? x : round(Number(x) * 255)))
    return `rgb(${bytes.join(' ')}${alpha})`
  }
  if (space === 'hsl' || space === 'hwb')
    return `${space}(${c[0]} ${percent(c[1])} ${percent(c[2])}${alpha})`
  if (OWN_FUNCTION.has(space)) return `${space}(${c.join(' ')}${alpha})`
  return `color(${space} ${c.join(' ')}${alpha})`
}

/** A table's own entry, never one its prototype lends (`constructor`). */
function own<T>(
  table: Record<string, T>,
  key: string | undefined,
): T | undefined {
  return key !== undefined && Object.hasOwn(table, key) ? table[key] : undefined
}

/** A `{ "$ref": "#/…" }` followed within `json`; anything else as it is. */
function pointed(json: Json, item: unknown): unknown {
  const keys = pointerKeys(item)
  if (!keys) return item
  return keys.reduce<unknown>(
    (at, key) => (isJson(at) && Object.hasOwn(at, key) ? at[key] : undefined),
    json,
  )
}

/** `{ "$ref": "#/a/b" }` → `['a', 'b']`; `undefined` for anything else. */
function pointerKeys(value: unknown): string[] | undefined {
  if (!isJson(value) || typeof value.$ref !== 'string') return undefined
  if (!value.$ref.startsWith('#/')) return undefined
  return value.$ref.slice(2).split('/').map(unescapePointer)
}

/** `{a.b}`, or an object with a `$ref`: a reference, whole or not. */
function isReference(value: unknown): boolean {
  if (typeof value === 'string') return /^\{[^{}]+\}$/.test(value)
  return isJson(value) && typeof value.$ref === 'string'
}

/**
 * The token path a reference names, `$root` folded into its group as the
 * walk does: `{a.b}`, `{ "$ref": "#/a/b" }` or `#/a/b/$value` → `a.b`;
 * `undefined` for a pointer into part of a value or outside the file.
 */
function referencePath(value: unknown): string | undefined {
  const keys =
    typeof value === 'string'
      ? /^\{([^{}]+)\}$/.exec(value)?.[1]?.split('.')
      : pointerKeys(value)
  if (!keys) return undefined
  const whole = (keys.at(-1) === '$value' ? keys.slice(0, -1) : keys).filter(
    (k) => k !== '$root',
  )
  return whole.some((k) => k.startsWith('$')) ? undefined : whole.join('.')
}

/** JSON Pointer's two escapes (RFC 6901). */
function unescapePointer(key: string): string {
  return key.replace(/~1/g, '/').replace(/~0/g, '~')
}
