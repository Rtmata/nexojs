import { cssString } from './css-string'
import type { Sheet } from './sheet'

/** One file of a font: a weight (a range for a variable font) and a style. */
export interface FontFile {
  /** Your own file, a path or URL: glyph never downloads. */
  readonly src: string
  /** `400`, or `'100 900'` for a variable font. */
  readonly weight?: number | string
  readonly style?: 'normal' | 'italic' | 'oblique'
}

/**
 * The fallback, adjusted to the font so nothing moves when it arrives:
 * a font on the device (`local`) and the numbers `measureFont`
 * prints, as ratios — `sizeAdjust: 1.07` is `size-adjust: 107%`.
 */
export interface FontMetrics {
  readonly local: string
  readonly sizeAdjust: number
  readonly ascent: number
  readonly descent: number
  readonly lineGap?: number
}

/** What `defineFonts` takes for each font. */
export interface FontDefinition {
  readonly family: string
  readonly files: readonly FontFile[]
  /** `font-display`; `swap` when left out. */
  readonly display?: 'auto' | 'block' | 'swap' | 'fallback' | 'optional'
  /** What shows before and without it, CSS's own words: `sans-serif`, `Georgia, serif`. */
  readonly fallback: string
  readonly metrics?: FontMetrics
}

/** A font as `defineFonts` gives it: `stack` goes into a token (`font: { body: fonts.body.stack }`). */
export interface Font {
  readonly family: string
  /** `"Inter", "Inter fallback", sans-serif`: the font, its adjusted fallback, the rest. */
  readonly stack: string
  readonly files: readonly FontFile[]
  readonly metrics?: FontMetrics
}

/** Each font by its key, and the sheet of `@font-face` rules that a `styles` list names. */
export type Fonts<F> = { readonly [K in keyof F]: Font } & Sheet

/**
 * Your font files as `@font-face` rules, written once from one declaration:
 * the family name can't drift between the rule and its uses, since
 * the token takes `stack`. With `metrics`, a fallback face from a device
 * font, sized to match. The rules stay out of layers: `@font-face`
 * has no cascade to order, and the same text serves an iframe.
 *
 *   const fonts = defineFonts({
 *     body: { family: 'Inter', files: [{ src: '/fonts/inter.woff2', weight: '100 900' }], fallback: 'sans-serif' },
 *   })
 *   const tokens = defineTokens({ font: { body: fonts.body.stack } })
 *   static styles = [fonts, tokens]
 */
export function defineFonts<const F extends Record<string, FontDefinition>>(
  definitions: F,
): Fonts<F> {
  const entries = Object.entries(definitions)
  for (const [key, definition] of entries) checkDefinition(key, definition)
  const rules = entries.flatMap(([, definition]) => facesOf(definition))
  const fonts = entries.map(([key, definition]) => [key, fontOf(definition)])
  return Object.freeze({
    ...Object.fromEntries(fonts),
    name: `glyph.fonts(${entries.map(([key]) => key).join(', ')})`,
    css: rules.join('\n'),
  }) as Fonts<F>
}

/**
 * The `<link rel="preload">` for each of a font's files, as HTML for the
 * `<head>`: omino places it with `raw()`, any other page as it is.
 *
 *   <head>{raw(preloadFont(fonts.body))}</head>
 */
export function preloadFont(font: Font): string {
  return font.files
    .map(({ src }) => {
      const type = MEDIA_TYPES[extensionOf(src)]
      const typed = type ? ` type="${type}"` : ''
      return `<link rel="preload" as="font"${typed} href="${htmlAttribute(src)}" crossorigin>`
    })
    .join('\n')
}

/** One `@font-face` per file, then the adjusted fallback when there are metrics. */
function facesOf(definition: FontDefinition): string[] {
  const { family, files, display = 'swap', metrics } = definition
  const faces = files.map((file) => faceRule(family, file, file.src, display))
  return metrics ? [...faces, fallbackRule(family, metrics)] : faces
}

/** `@font-face` for one file at `url` (its own path, or a `blob:` URL for bytes). */
export function faceRule(
  family: string,
  file: Omit<FontFile, 'src'>,
  url: string,
  display: string,
): string {
  const format = FORMATS[extensionOf(url)]
  const lines = [
    `font-family: "${cssString(family)}";`,
    `src: url("${cssString(url)}")${format ? ` format("${format}")` : ''};`,
    ...(file.weight === undefined ? [] : [`font-weight: ${file.weight};`]),
    ...(file.style === undefined ? [] : [`font-style: ${file.style};`]),
    `font-display: ${display};`,
  ]
  return `@font-face {\n${lines.map((l) => `  ${l}`).join('\n')}\n}`
}

function fallbackRule(family: string, metrics: FontMetrics): string {
  const { local, sizeAdjust, ascent, descent, lineGap = 0 } = metrics
  const lines = [
    `font-family: "${cssString(fallbackName(family))}";`,
    `src: local("${cssString(local)}");`,
    `size-adjust: ${percent(sizeAdjust)};`,
    `ascent-override: ${percent(ascent)};`,
    `descent-override: ${percent(descent)};`,
    `line-gap-override: ${percent(lineGap)};`,
  ]
  return `@font-face {\n${lines.map((l) => `  ${l}`).join('\n')}\n}`
}

function fontOf(definition: FontDefinition): Font {
  const { family, files, fallback, metrics } = definition
  const adjusted = metrics ? [`"${cssString(fallbackName(family))}"`] : []
  const stack = [`"${cssString(family)}"`, ...adjusted, fallback].join(', ')
  return Object.freeze({
    family,
    stack,
    files: Object.freeze([...files]),
    metrics,
  })
}

function fallbackName(family: string): string {
  return `${family} fallback`
}

function percent(ratio: number): string {
  return `${Math.round(ratio * 10000) / 100}%`
}

const FORMATS: Record<string, string> = {
  woff2: 'woff2',
  woff: 'woff',
  ttf: 'truetype',
  otf: 'opentype',
}

const MEDIA_TYPES: Record<string, string> = {
  woff2: 'font/woff2',
  woff: 'font/woff',
  ttf: 'font/ttf',
  otf: 'font/otf',
}

/** `woff2` from `/fonts/inter.woff2?v=3`; `''` for a `blob:` URL or none. */
function extensionOf(url: string): string {
  const path = url.split(/[?#]/)[0]!
  const dot = path.lastIndexOf('.')
  return dot < 0 ? '' : path.slice(dot + 1).toLowerCase()
}

function htmlAttribute(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** What a weight may be: 1–1000, a range of two, or a keyword. */
const WEIGHT = /^(?:normal|bold|\d+(?:\.\d+)?(?:\s+\d+(?:\.\d+)?)?)$/

/** Text that would end a declaration, a rule or the `<style>`. */
const BREAKS_OUT = /[;{}\n\r]|<\/style/i

/** A mistake in a declaration is a mistake in code: it throws, saying which (CONTRIBUTING). */
function checkDefinition(key: string, definition: FontDefinition): void {
  const where = `glyph: defineFonts ${key}`
  const fail = (what: string) => {
    throw new Error(`${where}: ${what}`)
  }
  if (key === 'name' || key === 'css')
    fail(
      "a font can't be called name or css: the fonts keep them for their sheet",
    )
  if (typeof definition.family !== 'string' || definition.family.trim() === '')
    fail('family is the font\'s name, such as "Inter"')
  if (!Array.isArray(definition.files) || definition.files.length === 0)
    fail('files lists at least one file: [{ src: "/fonts/inter.woff2" }]')
  for (const file of definition.files) {
    if (
      typeof file.src !== 'string' ||
      file.src === '' ||
      /[\n\r]/.test(file.src)
    )
      fail(`${JSON.stringify(file.src)} can't be a file's src`)
    if (file.weight !== undefined && !WEIGHT.test(String(file.weight)))
      fail(
        `weight ${JSON.stringify(file.weight)} is a number such as 400, a range such as "100 900", normal or bold`,
      )
  }
  if (
    typeof definition.fallback !== 'string' ||
    definition.fallback.trim() === '' ||
    BREAKS_OUT.test(definition.fallback)
  )
    fail('fallback is what shows without the font, such as "sans-serif"')
  const { metrics } = definition
  if (metrics === undefined) return
  if (typeof metrics.local !== 'string' || metrics.local.trim() === '')
    fail('metrics.local names a font on the device, such as "Arial"')
  for (const k of ['sizeAdjust', 'ascent', 'descent', 'lineGap'] as const) {
    const n = metrics[k]
    const optional = k === 'lineGap' && n === undefined // the other three are required
    if (!optional && !(typeof n === 'number' && Number.isFinite(n) && n >= 0))
      fail(`metrics.${k} is a ratio such as 1.07, as measureFont prints it`)
  }
}
