import { cssString } from '../../shared/glyph/css-string'
import type { Font, FontMetrics } from '../../shared/glyph/fonts'
import { round } from '../../shared/glyph/grammar/numbers'

/** A name no page uses, so the font measured is this file and nothing the page already has. */
const PROBE = 'glyph measure probe'

/** Text with the letters' usual mix, for an average width. */
const SAMPLE = 'The quick brown fox jumps over the lazy dog, 0123456789.'

/**
 * Development only, from your dev entry: the numbers for a font's
 * `metrics`, measured by this browser itself — no font-file reader.
 * Loads the font's first file, measures it and the device font with a
 * canvas at 100px, prints a line to copy and returns the same numbers.
 * Browsers read different tables of a font, so this is this browser's
 * view; a device font that isn't installed measures the default instead.
 *
 *   measureFont(fonts.body, { local: 'Arial' })
 *   // glyph: Inter over Arial → metrics: { local: 'Arial', sizeAdjust: 1.0715, ascent: 0.9035, descent: 0.2253 }
 */
export async function measureFont(
  font: Font,
  { local = font.metrics?.local }: { readonly local?: string } = {},
): Promise<FontMetrics> {
  const against = required(font, local)
  const face = probeFace(font)
  document.fonts.add(await face.load())
  try {
    return logged(font, measured(against))
  } finally {
    document.fonts.delete(face)
  }
}

/** The device font to measure against, or an error that says how to name one. */
function required(font: Font, local: string | undefined): string {
  if (local) return local
  throw new Error(
    `glyph: measureFont ${font.family}: say which device font it falls back to: { local: 'Arial' }`,
  )
}

/** The font's first file under a name no page uses. */
function probeFace(font: Font): FontFace {
  const { src, ...descriptors } = font.files[0]!
  const url = `url("${cssString(src)}")`
  return new FontFace(PROBE, url, descriptors as FontFaceDescriptors)
}

/** The line to copy, printed; the same numbers returned. */
function logged(font: Font, metrics: FontMetrics): FontMetrics {
  console.log(
    `glyph: ${font.family} over ${metrics.local} → metrics: ${shown(metrics)}`,
  )
  return metrics
}

/** size-adjust = the font's width over the device font's; the overrides are relative to the adjusted size (Chrome's formula). */
function measured(local: string): FontMetrics {
  const own = textAt100(PROBE)
  const sizeAdjust = own.width / textAt100(local).width
  const ratio = (px: number) => round(px / 100 / sizeAdjust)
  return {
    local,
    sizeAdjust: round(sizeAdjust),
    ascent: ratio(own.fontBoundingBoxAscent),
    descent: ratio(own.fontBoundingBoxDescent),
  }
}

/** The sample text in `family` at 100px, measured by a canvas. */
function textAt100(family: string): TextMetrics {
  const context = document.createElement('canvas').getContext('2d')!
  context.font = `100px "${cssString(family)}"`
  return context.measureText(SAMPLE)
}

function shown({ local, sizeAdjust, ascent, descent }: FontMetrics): string {
  return `{ local: '${local}', sizeAdjust: ${sizeAdjust}, ascent: ${ascent}, descent: ${descent} }`
}
