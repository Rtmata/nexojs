import { NAMED_COLORS } from './named'
import { oklabToRgb, oklchToOklab, type Rgb } from './spaces'

/** A CSS number with its unit, if any: `50%`, `.5`, `120deg`, `1e2`. */
const NUMBER =
  /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(%|deg|grad|rad|turn)?$/

const HEX = /^([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/

/** Degrees in one of each hue unit; a bare number is degrees. */
const DEGREES: Record<string, number> = {
  '': 1,
  deg: 1,
  grad: 0.9,
  rad: 180 / Math.PI,
  turn: 360,
}

/** How much 100% is, where a percentage stands for a number (CSS Color 4). */
const FULL = { rgb: 255, alpha: 1, hslPercent: 100, lightness: 1, chroma: 0.4 }

/**
 * A CSS colour as sRGB, read by glyph itself (zero dependencies):
 * hex, `rgb()`/`rgba()`, `hsl()`/`hsla()`, `oklch()`, `oklab()` — comma or
 * space syntax, `/ alpha` — and the named colours. A token reference or any
 * other CSS (`currentColor`, `color-mix()`) throws: glyph computes with
 * values, not with what only the page can resolve.
 *
 *   readColor('#3b82f6')          // { red: 0.23, green: 0.51, blue: 0.96, alpha: 1 }
 *   readColor('oklch(0.7 0.1 250)')
 */
export function readColor(text: string): Rgb {
  return new ColorReader(text).read()
}

/** Reads one colour; every mistake names the text it was given. */
class ColorReader {
  private readonly source: string

  constructor(private readonly text: string) {
    this.source = text.trim().toLowerCase()
  }

  read(): Rgb {
    if (this.source.startsWith('#')) return this.hex(this.source.slice(1))
    const call = /^([a-z]+)\((.*)\)$/.exec(this.source)
    if (!call) return this.named()
    return this.call(call[1]!, call[2]!.split(/[\s,/]+/).filter(Boolean))
  }

  private hex(digits: string): Rgb {
    if (!HEX.test(digits)) this.fail()
    const short = digits.length <= 4
    const pairs = short ? [...digits].map((d) => d + d) : digits.match(/../g)!
    const [red, green, blue, alpha = 1] = pairs.map(
      (p) => parseInt(p, 16) / 255,
    )
    return { red: red!, green: green!, blue: blue!, alpha }
  }

  private named(): Rgb {
    if (this.source === 'transparent')
      return { red: 0, green: 0, blue: 0, alpha: 0 }
    if (!Object.hasOwn(NAMED_COLORS, this.source)) this.fail()
    return this.hex(NAMED_COLORS[this.source]!.slice(1))
  }

  /** `rgb(…)` and its kin: three components and an optional alpha. */
  private call(name: string, args: string[]): Rgb {
    if (args.length !== 3 && args.length !== 4) this.fail()
    const [x, y, z, a] = args as [string, string, string, string?]
    const alpha = clamp(a === undefined ? 1 : this.scaled(a, FULL.alpha))
    if (name === 'rgb' || name === 'rgba') return this.rgb(x, y, z, alpha)
    if (name === 'hsl' || name === 'hsla') return this.hsl(x, y, z, alpha)
    if (name === 'oklch') return this.oklch(x, y, z, alpha)
    if (name === 'oklab') return this.oklab(x, y, z, alpha)
    return this.fail()
  }

  private rgb(r: string, g: string, b: string, alpha: number): Rgb {
    const [red, green, blue] = [r, g, b].map((c) =>
      clamp(this.scaled(c, FULL.rgb) / 255),
    )
    return { red: red!, green: green!, blue: blue!, alpha }
  }

  /** Saturation and lightness are percentages, `%` written or not (CSS Color 4). */
  private hsl(h: string, s: string, l: string, alpha: number): Rgb {
    const [saturation, lightness] = [s, l].map((c) =>
      clamp(this.scaled(c, FULL.hslPercent) / 100),
    )
    return hslToRgb(this.hue(h), saturation!, lightness!, alpha)
  }

  private oklch(l: string, c: string, h: string, alpha: number): Rgb {
    const lightness = clamp(this.scaled(l, FULL.lightness))
    const chroma = Math.max(0, this.scaled(c, FULL.chroma))
    return oklabToRgb(
      oklchToOklab({ lightness, chroma, hue: this.hue(h), alpha }),
    )
  }

  private oklab(l: string, a: string, b: string, alpha: number): Rgb {
    const lightness = clamp(this.scaled(l, FULL.lightness))
    const [x, y] = [a, b].map((c) => this.scaled(c, FULL.chroma))
    return oklabToRgb({ lightness, a: x!, b: y!, alpha })
  }

  /** A number, or a percentage of `full`. `none` (a missing component) is 0. */
  private scaled(arg: string, full: number): number {
    const { value, unit } = this.number(arg)
    if (unit === '') return value
    if (unit === '%') return (value / 100) * full
    return this.fail()
  }

  private hue(arg: string): number {
    const { value, unit } = this.number(arg)
    if (!Object.hasOwn(DEGREES, unit)) this.fail()
    return (((value * DEGREES[unit]!) % 360) + 360) % 360
  }

  private number(arg: string): { value: number; unit: string } {
    if (arg === 'none') return { value: 0, unit: '' }
    const match = NUMBER.exec(arg)
    if (!match) this.fail()
    return { value: Number(match[1]), unit: match[2] ?? '' }
  }

  private fail(): never {
    if (this.source.startsWith('var('))
      throw new Error(
        `glyph: "${this.text}" is a token, not a colour; colour maths needs the colour itself`,
      )
    throw new Error(
      `glyph: "${this.text}" is not a colour glyph can read; write hex, rgb(), hsl(), oklch(), oklab() or a CSS colour name`,
    )
  }
}

/** CSS Color 4's `hslToRgb`: each channel from where the hue sits on the wheel. */
function hslToRgb(
  hue: number,
  saturation: number,
  lightness: number,
  alpha: number,
): Rgb {
  const reach = saturation * Math.min(lightness, 1 - lightness)
  const channel = (n: number) => {
    const k = (n + hue / 30) % 12
    return lightness - reach * Math.max(-1, Math.min(k - 3, 9 - k, 1))
  }
  return { red: channel(0), green: channel(8), blue: channel(4), alpha }
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value))
}
