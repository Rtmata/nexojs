import { readColor } from '../color/read'
import { splitTop } from '../grammar/split'
import { dimensionOf, isLength, numberOf } from '../grammar/numbers'
import type { TokenGroup } from '../token-group'
import { DEFINITION, type Defined } from '../token-set'
import { isLightDark } from '../token-group'
import type { TokenType } from '../typed'
import { DTCG_TYPE, EASING_CURVES, Mistakes, type Json } from './common'

/** What `toDtcg` gives: the token file, and a resolver when colours change with the scheme. */
export interface DtcgFiles {
  /** The tokens; a `{ light, dark }` colour holds its light value here. */
  readonly tokens: Json
  /** DTCG's Resolver Module: a `colorScheme` modifier with light and dark contexts. */
  readonly resolver?: Json
}

/**
 * glyph's tokens as DTCG 2025.10 JSON (B.1), for Figma, Style Dictionary
 * and others: each group a top-level group with its `$type`, references as
 * `{group.token}`. Several token objects go in one file, so references
 * between them (a palette) stay references. A value DTCG has no form for
 * (`1em`, `steps()`, a colour glyph can't read) is a mistake: all of them
 * are thrown in one message.
 *
 *   const { tokens: json, resolver } = toDtcg(palette, tokens)
 */
export function toDtcg(...sources: readonly Defined<unknown>[]): DtcgFiles {
  const groups = sources.flatMap((source) => [...source[DEFINITION].groups])
  const writer = new DtcgWriter(groups)
  const files = writer.files()
  writer.mistakes.throwIfAny()
  return files
}

class DtcgWriter {
  readonly mistakes = new Mistakes('toDtcg')
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

  files(): DtcgFiles {
    const tokens = this.document('light')
    const dual = this.groups.some((g) => g.hasLightDark())
    if (!dual) return { tokens }
    const contexts = {
      light: [this.dualOnly('light')],
      dark: [this.dualOnly('dark')],
    }
    return {
      tokens,
      resolver: {
        version: '2025-10-01',
        sets: { tokens: { sources: [tokens] } },
        modifiers: { colorScheme: { contexts, default: 'light' } },
        resolutionOrder: [
          { $ref: '#/sets/tokens' },
          { $ref: '#/modifiers/colorScheme' },
        ],
      },
    }
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
    return /^var\(--[A-Za-z0-9_-]+\)$/.test(text.trim())
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
      const { red, green, blue, alpha } = readColor(String(value))
      const components = [red, green, blue].map((c) =>
        round(Math.min(1, Math.max(0, c))),
      )
      const hex = `#${components
        .map((c) =>
          Math.round(c * 255)
            .toString(16)
            .padStart(2, '0'),
        )
        .join('')}`
      return {
        colorSpace: 'srgb',
        components,
        ...(alpha === 1 ? {} : { alpha: round(alpha) }),
        hex,
      }
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
    const words: Record<string, number> = { normal: 400, bold: 700 }
    const n = words[String(value)] ?? numberOf(String(value))
    return (
      n ??
      this.mistakes.add(
        `${where}: ${JSON.stringify(value)} has no DTCG form; write a number from 1 to 1000`,
      )
    )
  }

  private easing(text: string, where: string): unknown {
    const curve = EASING_CURVES[text.trim().toLowerCase()]
    if (curve) return [...curve]
    const call = /^cubic-bezier\((.*)\)$/i.exec(text.trim())
    const numbers = call ? splitTop(call[1]!, ',')?.map(numberOf) : undefined
    if (numbers?.length === 4 && !numbers.includes(undefined)) return numbers
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
    const parts = splitTop(layer, ' ') ?? []
    const inset = parts.some((p) => p.toLowerCase() === 'inset')
    const rest = parts.filter((p) => p.toLowerCase() !== 'inset')
    const lengths = rest.filter((p) => this.isLength(p))
    const colors = rest.filter((p) => !this.isLength(p))
    if (lengths.length < 2 || lengths.length > 4 || colors.length !== 1)
      return this.mistakes.add(
        `${where}: ${JSON.stringify(layer)} has no DTCG form; a shadow layer is two to four lengths and a colour`,
      )
    const [offsetX, offsetY, blur = ZERO, spread = ZERO] = lengths.map((l) =>
      this.value('dimension', l, where),
    )
    const color = this.value('color', colors[0], where)
    return {
      color,
      offsetX,
      offsetY,
      blur,
      spread,
      ...(inset ? { inset } : {}),
    }
  }

  /** A length, or a reference to a dimension token; anything else in a layer is its colour. */
  private isLength(part: string): boolean {
    if (this.isReference(part))
      return this.targets.get(propertyOf(part))?.type === 'dimension'
    const found = dimensionOf(part)
    return found !== undefined && isLength(found)
  }
}

/** DTCG's zero: it wants a unit even then. */
const ZERO = { value: 0, unit: 'px' }

/** `var(--color-primary)` → `color-primary`. */
function propertyOf(reference: string): string {
  return reference.trim().slice(6, -1)
}

/** A font-family list as DTCG's array of names, quotes taken off. */
function families(list: string): string[] {
  return (splitTop(list, ',') ?? [list]).map((name) =>
    name.trim().replace(/^(["'])(.*)\1$/, '$2'),
  )
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000
}
