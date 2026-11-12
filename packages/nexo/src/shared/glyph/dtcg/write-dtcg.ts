import { readColor } from '../color/read'
import { splitTop } from '../grammar/split'
import { dimensionOf, isLength, numberOf, round } from '../grammar/numbers'
import type { TokenGroup } from '../token-group'
import { referenceName } from '../reference'
import { DEFINITION, type Defined } from '../token-set'
import { isLightDark } from '../token-group'
import type { TokenType } from '../typed'
import {
  DTCG_TYPE,
  EASING_CURVES,
  Mistakes,
  WEIGHT_WORDS,
  type Json,
} from './common'

/** What `writeDtcg` gives: the token file, and a resolver when colours change with the scheme. */
export interface DtcgOutput {
  /** The tokens; a `{ light, dark }` colour holds its light value here. */
  readonly tokens: Json
  /** DTCG's Resolver Module: a `colorScheme` modifier with light and dark contexts. */
  readonly resolver?: Json
}

/**
 * glyph's tokens as DTCG 2025.10 JSON, for Figma, Style Dictionary
 * and others: each group a top-level group with its `$type`, references as
 * `{group.token}`. Several token objects go in one file, so references
 * between them (a palette) stay references. A value DTCG has no form for
 * (`1em`, `steps()`, a colour glyph can't read) is a mistake: all of them
 * are thrown in one message.
 *
 *   const { tokens: json, resolver } = writeDtcg(palette, tokens)
 */
export function writeDtcg(...sources: readonly Defined<unknown>[]): DtcgOutput {
  const groups = sources.flatMap((source) => [...source[DEFINITION].groups])
  const writer = new DtcgWriter(groups)
  const files = writer.files()
  writer.mistakes.throwIfAny()
  return files
}

class DtcgWriter {
  readonly mistakes = new Mistakes('writeDtcg')
  /** `color-primary` → its path and type: every property a reference may name. */
  private readonly targets: Map<string, { path: string; type: TokenType }>

  constructor(private readonly groups: readonly TokenGroup[]) {
    this.targets = new Map(
      groups.flatMap((g) =>
        g
          .tokenNames()
          .map((t) => [
            `${g.name}-${t}`,
            { path: `${g.name}.${t}`, type: g.type },
          ]),
      ),
    )
  }

  files(): DtcgOutput {
    const tokens = this.document('light')
    const dual = this.groups.some((g) => g.hasLightDark())
    if (!dual) return { tokens }
    const contexts = {
      light: [this.dualOnly('light')],
      dark: [this.dualOnly('dark')],
    }
    return { tokens, resolver: resolverOf(tokens, contexts) }
  }

  /** Every group, its tokens with the scheme's side of each `{ light, dark }`. */
  private document(scheme: 'light' | 'dark'): Json {
    return Object.fromEntries(
      this.groups.map((g) => [
        g.name,
        { $type: DTCG_TYPE[g.type], ...this.tokensOf(g, scheme, () => true) },
      ]),
    )
  }

  /** Only the `{ light, dark }` colours, for a resolver context. */
  private dualOnly(scheme: 'light' | 'dark'): Json {
    const groups = this.groups.filter((g) => g.hasLightDark())
    return Object.fromEntries(
      groups.map((g) => [
        g.name,
        {
          $type: 'color',
          ...this.tokensOf(g, scheme, (t) => isLightDark(g.valueOf(t))),
        },
      ]),
    )
  }

  private tokensOf(
    g: TokenGroup,
    scheme: 'light' | 'dark',
    keep: (token: string) => boolean,
  ): Json {
    const tokens = g.tokenNames().filter(keep)
    return Object.fromEntries(
      tokens.map((t) => {
        const written = g.valueOf(t)
        const side = isLightDark(written) ? written[scheme] : written
        const where = `${g.name}.${t}`
        return [t, { $value: this.value(g.type, side, where) }]
      }),
    )
  }

  private value(type: TokenType, value: unknown, where: string): unknown {
    if (typeof value === 'string' && this.isReference(value))
      return this.reference(value, where)
    return this.writers[type](value, where)
  }

  private readonly writers: Record<
    TokenType,
    (value: unknown, where: string) => unknown
  > = {
    color: (v, w) => this.color(v, w),
    dimension: (v, w) => this.dimension(v, w),
    fontFamily: (v) => families(String(v)),
    fontWeight: (v, w) => this.weight(v, w),
    shadow: (v, w) => this.shadow(String(v), w),
    duration: (v) => ({ value: v, unit: 'ms' }),
    easing: (v, w) => this.easing(String(v), w),
    number: (v) => v,
  }

  private isReference(text: string): boolean {
    return referenceName(text) !== undefined
  }

  private reference(text: string, where: string): string | undefined {
    const target = this.targets.get(propertyOf(text))
    if (target) return `{${target.path}}`
    return this.mistakes.add(
      `${where}: ${text} points to a token none of these define; pass its token object too`,
    )
  }

  /** sRGB components, alpha when not opaque, and the 6-digit hex DTCG asks for. */
  private color(value: unknown, where: string): unknown {
    try {
      return srgbColor(String(value))
    } catch {
      return this.mistakes.add(
        `${where}: ${JSON.stringify(value)} is a colour glyph can't read, so it has no DTCG form`,
      )
    }
  }

  private dimension(value: unknown, where: string): unknown {
    const found = dimensionOf(String(value).trim())
    if (found && (found.unit === 'px' || found.unit === 'rem'))
      return { value: found.value, unit: found.unit }
    if (found?.unit === '' && found.value === 0) return { value: 0, unit: 'px' }
    return this.mistakes.add(
      `${where}: ${JSON.stringify(value)} has no DTCG form; DTCG dimensions are px or rem`,
    )
  }

  private weight(value: unknown, where: string): unknown {
    if (typeof value === 'number') return value
    return (
      weightNumber(String(value)) ??
      this.mistakes.add(
        `${where}: ${JSON.stringify(value)} has no DTCG form; write a number from 1 to 1000`,
      )
    )
  }

  private easing(text: string, where: string): unknown {
    const curve = curveOf(text)
    if (curve) return curve
    return this.mistakes.add(
      `${where}: ${JSON.stringify(text)} has no DTCG form; DTCG easings are cubic-bezier curves`,
    )
  }

  /** Each layer as DTCG's shadow object; a reference stays one, slot by slot. */
  private shadow(text: string, where: string): unknown {
    const layers = (splitTop(text, ',') ?? []).map((layer) =>
      this.layer(layer, where),
    )
    if (layers.includes(undefined)) return undefined
    return layers.length === 1 ? layers[0] : layers
  }

  private layer(layer: string, where: string): Json | undefined {
    const { inset, lengths, colors } = this.partsOf(layer)
    if (!fitsLayer(lengths, colors)) return this.notALayer(layer, where)
    const [offsetX, offsetY, blur = ZERO, spread = ZERO] = lengths.map((l) =>
      this.value('dimension', l, where),
    )
    const color = this.value('color', colors[0], where)
    const shape = { color, offsetX, offsetY, blur, spread }
    return inset ? { ...shape, inset } : shape
  }

  private notALayer(layer: string, where: string): undefined {
    return this.mistakes.add(
      `${where}: ${JSON.stringify(layer)} has no DTCG form; a shadow layer is two to four lengths and a colour`,
    )
  }

  /** A shadow layer's parts by role: whether it is inset, its lengths, the rest (its colour). */
  private partsOf(layer: string) {
    const parts = splitTop(layer, ' ') ?? []
    const inset = parts.some((p) => p.toLowerCase() === 'inset')
    const rest = parts.filter((p) => p.toLowerCase() !== 'inset')
    const lengths = rest.filter((p) => this.isLength(p))
    return { inset, lengths, colors: rest.filter((p) => !this.isLength(p)) }
  }

  /** A length, or a reference to a dimension token; anything else in a layer is its colour. */
  private isLength(part: string): boolean {
    if (this.isReference(part))
      return this.targets.get(propertyOf(part))?.type === 'dimension'
    const found = dimensionOf(part)
    return found !== undefined && isLength(found)
  }
}

/** Two to four lengths and one colour: what DTCG's shadow object can hold. */
function fitsLayer(lengths: string[], colors: string[]): boolean {
  return lengths.length >= 2 && lengths.length <= 4 && colors.length === 1
}

/** The resolver document: the token file as its set, light and dark as a `colorScheme` modifier. */
function resolverOf(tokens: Json, contexts: Json): Json {
  return {
    version: '2025-10-01',
    sets: { tokens: { sources: [tokens] } },
    modifiers: { colorScheme: { contexts, default: 'light' } },
    resolutionOrder: [
      { $ref: '#/sets/tokens' },
      { $ref: '#/modifiers/colorScheme' },
    ],
  }
}

/** A colour glyph reads as DTCG's sRGB object: components clipped to 0–1, alpha when not opaque, the 6-digit hex. */
function srgbColor(text: string): Json {
  const { red, green, blue, alpha } = readColor(text)
  const components = [red, green, blue].map((c) =>
    round(Math.min(1, Math.max(0, c))),
  )
  const hex = `#${components.map(hexByte).join('')}`
  const opacity = alpha === 1 ? {} : { alpha: round(alpha) }
  return { colorSpace: 'srgb', components, ...opacity, hex }
}

function hexByte(channel: number): string {
  return Math.round(channel * 255)
    .toString(16)
    .padStart(2, '0')
}

/** A weight word (DTCG's or CSS's) or a number written as text. */
function weightNumber(word: string): number | undefined {
  return Object.hasOwn(WEIGHT_WORDS, word) ? WEIGHT_WORDS[word] : numberOf(word)
}

/** A keyword's curve, or a `cubic-bezier()`'s four numbers; else nothing. */
function curveOf(text: string): number[] | undefined {
  const keyword = text.trim().toLowerCase()
  if (Object.hasOwn(EASING_CURVES, keyword)) return [...EASING_CURVES[keyword]!]
  const call = /^cubic-bezier\((.*)\)$/i.exec(text.trim())
  const numbers = call ? splitTop(call[1]!, ',')?.map(numberOf) : undefined
  if (numbers?.length === 4 && !numbers.includes(undefined))
    return numbers as number[]
  return undefined
}

/** DTCG's zero: it wants a unit even then. */
const ZERO = { value: 0, unit: 'px' }

/** `var(--color-primary)` → `color-primary`. */
function propertyOf(reference: string): string {
  return referenceName(reference) ?? ''
}

/** A font-family list as DTCG's array of names, quotes taken off. */
function families(list: string): string[] {
  return (splitTop(list, ',') ?? [list]).map((name) =>
    name.trim().replace(/^(["'])(.*)\1$/, '$2'),
  )
}
