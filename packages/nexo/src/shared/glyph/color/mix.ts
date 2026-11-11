import { readColor } from './read'
import { oklabToOklch, rgbToOklab, type Oklch } from './spaces'

/**
 * `percent` of `a` mixed with the rest of `b` in OKLCH (C.5), as CSS's
 * `color-mix(in oklch, a percent%, b)` does — the shorter way round the hue,
 * a grey taking the other's hue, alpha premultiplied — so a computed value
 * looks like the one the browser would compute. Returns `oklch()` text: it
 * keeps colours sRGB can't show, and the browser fits them to the screen.
 *
 *   colorMix('#3b82f6', 'white', 20) // 'oklch(0.9246 0.0376 259.81)'
 */
export function colorMix(a: string, b: string, percent: number): string {
  if (!(percent >= 0 && percent <= 100))
    throw new Error(
      `glyph: colorMix's percent is ${percent}; write 0 to 100, how much of the first colour`,
    )
  const [x, y] = [a, b].map((text) => oklabToOklch(rgbToOklab(readColor(text))))
  return written(mixed(x!, y!, percent / 100))
}

/** CSS Color 4 §12: L and C premultiplied by alpha, the hue not. */
function mixed(x: Oklch, y: Oklch, weight: number): Oklch {
  const alpha = x.alpha * weight + y.alpha * (1 - weight)
  const between = (of: (c: Oklch) => number) =>
    premultiplied(of(x) * x.alpha, of(y) * y.alpha, weight, alpha)
  const lightness = between((c) => c.lightness)
  const chroma = between((c) => c.chroma)
  return { lightness, chroma, hue: hueBetween(x, y, weight), alpha }
}

/** Both values were multiplied by their alpha; the mix is divided by its own. */
function premultiplied(
  x: number,
  y: number,
  weight: number,
  alpha: number,
): number {
  if (alpha === 0) return 0 // fully transparent: nothing to see, nothing to divide by
  return (x * weight + y * (1 - weight)) / alpha
}

/** A grey has no hue: the other's is used. Between two hues, the shorter arc. */
function hueBetween(x: Oklch, y: Oklch, weight: number): number | null {
  if (x.hue === null || y.hue === null) return x.hue ?? y.hue
  let [from, to] = [x.hue, y.hue]
  if (to - from > 180) from += 360
  else if (to - from < -180) to += 360
  return (((from * weight + to * (1 - weight)) % 360) + 360) % 360
}

function written({ lightness, chroma, hue, alpha }: Oklch): string {
  const color = `${round(lightness, 4)} ${round(chroma, 4)} ${round(hue ?? 0, 2)}`
  return alpha === 1
    ? `oklch(${color})`
    : `oklch(${color} / ${round(alpha, 4)})`
}

function round(value: number, digits: number): number {
  return Number(value.toFixed(digits))
}
