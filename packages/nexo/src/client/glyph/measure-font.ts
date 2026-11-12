import { cssString } from '../../shared/glyph/css-string'
import type { Font, FontMetrics } from '../../shared/glyph/fonts'

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
  if (!local)
    throw new Error(
      `glyph: measureFont ${font.family}: say which device font it falls back to: { local: 'Arial' }`,
    )
  const { src, ...descriptors } = font.files[0]!
  const face = new FontFace(
    PROBE,
    `url("${cssString(src)}")`,
    descriptors as FontFaceDescriptors,
  )
  document.fonts.add(await face.load())
  try {
    const metrics = measured(local)
    console.log(
      `glyph: ${font.family} over ${local} → metrics: ${shown(metrics)}`,
    )
    return metrics
  } finally {
    document.fonts.delete(face)
  }
}

/** size-adjust = the font's width over the device font's; the overrides are relative to the adjusted size (Chrome's formula). */
function measured(local: string): FontMetrics {
  const context = document.createElement('canvas').getContext('2d')!
  const measure = (family: string) => {
    context.font = `100px "${cssString(family)}"`
    return context.measureText(SAMPLE)
  }
  const own = measure(PROBE)
  const sizeAdjust = own.width / measure(local).width
  const ratio = (px: number) => round(px / 100 / sizeAdjust)
  return {
    local,
    sizeAdjust: round(sizeAdjust),
    ascent: ratio(own.fontBoundingBoxAscent),
    descent: ratio(own.fontBoundingBoxDescent),
  }
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000
}

function shown({ local, sizeAdjust, ascent, descent }: FontMetrics): string {
  return `{ local: '${local}', sizeAdjust: ${sizeAdjust}, ascent: ${ascent}, descent: ${descent} }`
}
