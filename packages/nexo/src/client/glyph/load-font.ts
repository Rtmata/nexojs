import { cssString } from '../../shared/glyph/css-string'
import { faceRule, type FontFile } from '../../shared/glyph/fonts'
import type { Sheet } from '../../shared/glyph/sheet'

/** A file a person brought: a URL (a file on the device) or its bytes. */
export interface LoadableFontFile extends Omit<FontFile, 'src'> {
  readonly src: string | ArrayBuffer | ArrayBufferView
}

/** What `loadFont` takes: `defineFonts`' shape, files from a person. */
export interface LoadableFont {
  readonly family: string
  readonly files: readonly LoadableFontFile[]
  readonly display?: 'auto' | 'block' | 'swap' | 'fallback' | 'optional'
}

/**
 * A font a person imports, in the page while `signal` lives: each
 * file loaded as a `FontFace` and added to `document.fonts`, taken away on
 * abort. It gives the `@font-face` text for a document the page's fonts
 * don't reach, an iframe: bytes are written as a `blob:` URL, freed
 * on abort too, which a same-origin iframe can read. A file the browser
 * can't read rejects, saying which formats it reads; so does an abort.
 *
 *   const mine = await loadFont({ family: 'Mi Fuente', files: [{ src: url }] }, { signal })
 *   frame.srcdoc = `<style>${fonts.css}${mine.css}</style>…`
 */
export async function loadFont(
  font: LoadableFont,
  { signal }: { readonly signal: AbortSignal },
): Promise<Sheet> {
  signal.throwIfAborted()
  const display = font.display ?? 'swap'
  const urls = font.files.map(({ src }) =>
    typeof src === 'string'
      ? src
      : URL.createObjectURL(new Blob([src as BlobPart])),
  )
  const faces = font.files.map((file, i) =>
    faceOf(font.family, file, urls[i]!, display),
  )
  const release = () => {
    for (const face of faces) document.fonts.delete(face)
    for (const [i, { src }] of font.files.entries())
      if (typeof src !== 'string') URL.revokeObjectURL(urls[i]!)
  }
  await loaded(font.family, faces, release)
  if (signal.aborted) throw (release(), signal.reason)
  for (const face of faces) document.fonts.add(face)
  signal.addEventListener('abort', release, { once: true })
  const css = font.files.map((file, i) =>
    faceRule(font.family, file, urls[i]!, display),
  )
  return Object.freeze({
    name: `glyph.fonts(loaded ${font.family})`,
    css: css.join('\n'),
  })
}

function faceOf(
  family: string,
  file: LoadableFontFile,
  url: string,
  display: string,
): FontFace {
  const descriptors: FontFaceDescriptors = { display: display as FontDisplay }
  if (file.weight !== undefined) descriptors.weight = String(file.weight)
  if (file.style !== undefined) descriptors.style = file.style
  return new FontFace(family, `url("${cssString(url)}")`, descriptors)
}

/** Every face loaded, or all freed and one error that says what the browser reads. */
async function loaded(
  family: string,
  faces: FontFace[],
  release: () => void,
): Promise<void> {
  try {
    await Promise.all(faces.map((face) => face.load()))
  } catch (cause) {
    release()
    throw new Error(
      `glyph: loadFont ${JSON.stringify(family)}: a file isn't a font the browser can read; it reads WOFF2, WOFF, TTF and OTF`,
      { cause },
    )
  }
}
