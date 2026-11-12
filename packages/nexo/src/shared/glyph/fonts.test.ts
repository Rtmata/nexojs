import { describe, expect, test } from 'bun:test'
import { defineFonts, preloadFont } from './fonts'
import { defineTokens } from './tokens'

const fonts = defineFonts({
  body: {
    family: 'Inter',
    files: [
      { src: '/fonts/inter.woff2', weight: '100 900' },
      { src: '/fonts/inter-italic.woff2', weight: '100 900', style: 'italic' },
    ],
    fallback: 'sans-serif',
    metrics: {
      local: 'Arial',
      sizeAdjust: 1.0715,
      ascent: 0.9035,
      descent: 0.2253,
    },
  },
  mono: {
    family: 'Mono "X"',
    files: [{ src: '/fonts/mono.ttf?v=2' }],
    fallback: 'monospace',
    display: 'optional',
  },
})

describe('defineFonts (F.1, F.2)', () => {
  test('one @font-face per file, the adjusted fallback after, no layer', () => {
    expect(fonts.name).toBe('glyph.fonts(body, mono)')
    expect(fonts.css).toBe(`@font-face {
  font-family: "Inter";
  src: url("/fonts/inter.woff2") format("woff2");
  font-weight: 100 900;
  font-display: swap;
}
@font-face {
  font-family: "Inter";
  src: url("/fonts/inter-italic.woff2") format("woff2");
  font-weight: 100 900;
  font-style: italic;
  font-display: swap;
}
@font-face {
  font-family: "Inter fallback";
  src: local("Arial");
  size-adjust: 107.15%;
  ascent-override: 90.35%;
  descent-override: 22.53%;
  line-gap-override: 0%;
}
@font-face {
  font-family: "Mono \\22 X\\22 ";
  src: url("/fonts/mono.ttf?v=2") format("truetype");
  font-display: optional;
}`)
  })

  test('the stack goes into a token: the family is written once', () => {
    expect(fonts.body.stack).toBe('"Inter", "Inter fallback", sans-serif')
    expect(fonts.mono.stack).toBe('"Mono \\22 X\\22 ", monospace')
    const tokens = defineTokens({ font: { body: fonts.body.stack } })
    expect(tokens.css).toContain(
      '--font-body: "Inter", "Inter fallback", sans-serif;',
    )
  })

  test('preloadFont: a link per file, as HTML for the head', () => {
    expect(preloadFont(fonts.body)).toBe(
      '<link rel="preload" as="font" type="font/woff2" href="/fonts/inter.woff2" crossorigin>\n' +
        '<link rel="preload" as="font" type="font/woff2" href="/fonts/inter-italic.woff2" crossorigin>',
    )
    expect(preloadFont(fonts.mono)).toBe(
      '<link rel="preload" as="font" type="font/ttf" href="/fonts/mono.ttf?v=2" crossorigin>',
    )
  })

  test('mistakes in a declaration throw, saying which', () => {
    const file = { src: '/f.woff2' }
    expect(() =>
      defineFonts({ body: { family: '', files: [file], fallback: 'serif' } }),
    ).toThrow("family is the font's name")
    expect(() =>
      defineFonts({ body: { family: 'A', files: [], fallback: 'serif' } }),
    ).toThrow('files lists at least one file')
    expect(() =>
      defineFonts({
        body: {
          family: 'A',
          files: [{ src: '/f', weight: 'heavy' }],
          fallback: 'serif',
        },
      }),
    ).toThrow('weight "heavy" is a number')
    expect(() =>
      defineFonts({
        body: { family: 'A', files: [file], fallback: 'serif; }' },
      }),
    ).toThrow('fallback is what shows')
    expect(() =>
      defineFonts({
        body: {
          family: 'A',
          files: [file],
          fallback: 'serif',
          metrics: { local: 'Arial', sizeAdjust: 1, ascent: 0.9 } as never,
        },
      }),
    ).toThrow('metrics.descent is a ratio')
    expect(() =>
      defineFonts({ css: { family: 'A', files: [file], fallback: 'serif' } }),
    ).toThrow("a font can't be called name or css")
  })
})
