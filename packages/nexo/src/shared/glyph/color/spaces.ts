/**
 * The colour spaces glyph computes in, and the conversions between them.
 * sRGB is what WCAG's contrast reads; OKLCH is where mixing looks
 * even to the eye. Numbers are CSS's own: channels 0–1, L 0–1, hue in degrees.
 */

/**
 * sRGB, gamma-encoded as CSS writes it. A colour from a wider space (an
 * `oklch()` outside sRGB) keeps channels beyond 0–1 until something needs
 * them clipped, so converting back loses nothing.
 */
export interface Rgb {
  readonly red: number
  readonly green: number
  readonly blue: number
  readonly alpha: number
}

export interface Oklab {
  readonly lightness: number
  readonly a: number
  readonly b: number
  readonly alpha: number
}

export interface Oklch {
  readonly lightness: number
  readonly chroma: number
  /** `null` for a grey: with no chroma, a hue means nothing (CSS's "powerless"). */
  readonly hue: number | null
  readonly alpha: number
}

type Vector = [number, number, number]
type Matrix = [Vector, Vector, Vector]

// Björn Ottosson's matrices for linear sRGB ↔ OKLab (bottosson.github.io/posts/oklab, 2021-01-25).
const RGB_TO_LMS: Matrix = [
  [0.4122214708, 0.5363325363, 0.0514459929],
  [0.2119034982, 0.6806995451, 0.1073969566],
  [0.0883024619, 0.2817188376, 0.6299787005],
]
const LMS_TO_LAB: Matrix = [
  [0.2104542553, 0.793617785, -0.0040720468],
  [1.9779984951, -2.428592205, 0.4505937099],
  [0.0259040371, 0.7827717662, -0.808675766],
]
const LAB_TO_LMS: Matrix = [
  [1, 0.3963377774, 0.2158037573],
  [1, -0.1055613458, -0.0638541728],
  [1, -0.0894841775, -1.291485548],
]
const LMS_TO_RGB: Matrix = [
  [4.0767416621, -3.3077115913, 0.2309699292],
  [-1.2684380046, 2.6097574011, -0.3413193965],
  [-0.0041960863, -0.7034186147, 1.707614701],
]

/** CSS Color 4's threshold (conversions.js): below it the hue is powerless. */
const ACHROMATIC = 0.000004

export function rgbToOklab({ red, green, blue, alpha }: Rgb): Oklab {
  const lms = multiply(RGB_TO_LMS, [red, green, blue].map(linear) as Vector)
  const [lightness, a, b] = multiply(LMS_TO_LAB, lms.map(Math.cbrt) as Vector)
  return { lightness, a, b, alpha }
}

export function oklabToRgb({ lightness, a, b, alpha }: Oklab): Rgb {
  const lms = multiply(LAB_TO_LMS, [lightness, a, b]).map((v) => v ** 3)
  const [red, green, blue] = multiply(LMS_TO_RGB, lms as Vector).map(gamma)
  return { red: red!, green: green!, blue: blue!, alpha }
}

export function oklabToOklch({ lightness, a, b, alpha }: Oklab): Oklch {
  const chroma = Math.hypot(a, b)
  const degrees = (Math.atan2(b, a) * 180) / Math.PI
  const hue = chroma <= ACHROMATIC ? null : (degrees + 360) % 360
  return { lightness, chroma, hue, alpha }
}

export function oklchToOklab({ lightness, chroma, hue, alpha }: Oklch): Oklab {
  const radians = ((hue ?? 0) * Math.PI) / 180
  const [a, b] = [chroma * Math.cos(radians), chroma * Math.sin(radians)]
  return { lightness, a, b, alpha }
}

/**
 * sRGB's transfer: gamma-encoded → linear light. The sign is kept, as CSS
 * does, so channels beyond 0–1 survive the round trip.
 */
export function linear(channel: number): number {
  const c = Math.abs(channel)
  const light = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  return Math.sign(channel) * light
}

function gamma(channel: number): number {
  const c = Math.abs(channel)
  const encoded = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055
  return Math.sign(channel) * encoded
}

function multiply(matrix: Matrix, [x, y, z]: Vector): Vector {
  return matrix.map((row) => row[0] * x + row[1] * y + row[2] * z) as Vector
}
