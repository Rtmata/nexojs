import { describe, expect, test } from 'bun:test'
import { defineTheme } from './theme'
import { defineTokens } from './tokens'
import { typed } from './typed'

const ORDER =
  '@layer glyph.reset, glyph.base, glyph.tokens, glyph.themes, glyph.recipes;'

const palette = defineTokens({
  blue: typed('color', { 300: '#93c5fd', 700: '#1d4ed8' }),
})

const tokens = defineTokens(
  {
    color: {
      text: '#222',
      surface: '#fff',
      primary: palette.blue[700],
      'on-primary': '#fff',
    },
    space: { m: '1rem' },
  },
  { refersTo: [palette], contrastChecks: [['text', 'surface', 'text']] },
)

describe('defineTheme (C.1–C.3)', () => {
  test('every value under data-theme, in glyph.themes, with its text and surface', () => {
    const night = defineTheme(tokens, 'night', {
      color: { text: '#eee', surface: '#111' },
    })
    expect(night.name).toBe('glyph.themes(night)')
    expect(night.css).toBe(`${ORDER}
@layer glyph.themes {
  [data-theme="night"] {
    color-scheme: normal;
    --color-text: #eee;
    --color-surface: #111;
    --color-primary: var(--blue-700);
    --color-on-primary: #fff;
    --space-m: 1rem;
    color: var(--color-text);
    background-color: var(--color-surface);
  }
}
`)
  })

  test('from: changes over another theme, keeping its scheme and the rest (C.2)', () => {
    const night = defineTheme(tokens, 'night', {
      colorScheme: 'dark',
      color: { text: '#eee', surface: '#111' },
    })
    const dusk = defineTheme(tokens, 'dusk', {
      from: night,
      color: { surface: '#223' },
      space: { m: '1.25rem' },
    })
    expect(dusk.css).toBe(`${ORDER}
@layer glyph.themes {
  [data-theme="dusk"] {
    color-scheme: dark;
    --color-text: #eee;
    --color-surface: #223;
    --color-primary: var(--blue-700);
    --color-on-primary: #fff;
    --space-m: 1.25rem;
    color: var(--color-text);
    background-color: var(--color-surface);
  }
}
`)
  })

  test('a theme over light-dark tokens follows the system, as the tokens do (C.3)', () => {
    const dual = defineTokens({
      color: { text: { light: '#222', dark: '#eee' }, surface: '#fff' },
    })
    const plain = defineTheme(dual, 'plain', {})
    expect(plain.css).toContain(`  [data-theme="plain"] {
    color-scheme: light dark;
    --color-text: light-dark(#222, #eee);`)
    const fixed = defineTheme(dual, 'fixed', { colorScheme: 'light' })
    expect(fixed.css).toContain('    color-scheme: light;\n')
  })

  test('a theme always writes its scheme, so it never takes the one around it', () => {
    const dual = defineTokens({
      color: { text: { light: '#222', dark: '#eee' }, surface: '#fff' },
    })
    const flat = defineTheme(dual, 'flat', { color: { text: '#000' } })
    expect(flat.css).toContain('    color-scheme: light dark;\n') // as the tokens' :root
  })

  test("colorScheme: 'inherit' writes CSS's own inherit, and from passes it on", () => {
    const dual = defineTokens({
      color: { text: { light: '#222', dark: '#eee' }, surface: '#fff' },
    })
    const inner = defineTheme(dual, 'inner', { colorScheme: 'inherit' })
    expect(inner.css).toContain('    color-scheme: inherit;\n')
    const deeper = defineTheme(dual, 'deeper', { from: inner })
    expect(deeper.css).toContain('    color-scheme: inherit;\n')
  })

  test("colorScheme: 'inherit' may show either scheme: contrast is measured in both", () => {
    const dual = defineTokens({
      color: {
        text: { light: '#222', dark: '#555' },
        surface: { light: '#fff', dark: '#111' },
      },
    })
    expect(() =>
      defineTheme(dual, 'inner', {
        colorScheme: 'inherit',
        contrastChecks: [['text', 'surface', 'text']],
      }),
    ).toThrow(
      'glyph: theme "inner": text on surface (dark): 2.53:1, needs 4.5:1',
    )
  })

  test('any text names a theme; the selector escapes what could end it (C.1)', () => {
    expect(defineTheme(tokens, 'modo noche', {}).css).toContain(
      '[data-theme="modo noche"] {',
    )
    const odd = defineTheme(tokens, 'a"b\\c</style>\n', {})
    expect(odd.css).toContain(
      '[data-theme="a\\22 b\\5c c\\3c /style\\3e \\a "] {',
    )
    expect(odd.css).not.toContain('</style')
  })

  test('tokens without text or surface colours: no color or background-color', () => {
    const spacing = defineTokens({ space: { m: '1rem' } })
    expect(defineTheme(spacing, 'roomy', { space: { m: '2rem' } }).css)
      .toBe(`${ORDER}
@layer glyph.themes {
  [data-theme="roomy"] {
    color-scheme: normal;
    --space-m: 2rem;
  }
}
`)
  })

  test('the theme is read-only, and the tokens unchanged', () => {
    const night = defineTheme(tokens, 'night', { color: { text: '#000' } })
    expect(Object.isFrozen(night)).toBe(true)
    expect(tokens.css).toContain('--color-text: #222;')
  })
})

describe('defineTheme: contrast checks (C.5)', () => {
  test('a pair that falls short throws, with the ratio and what it needs', () => {
    expect(() =>
      defineTheme(tokens, 'pale', {
        color: { primary: palette.blue[300] },
        contrastChecks: [['on-primary', 'primary', 'text']],
      }),
    ).toThrow('glyph: theme "pale": on-primary on primary: 1.8:1, needs 4.5:1')
  })

  test("the tokens' pairs are checked in every theme made from them", () => {
    expect(() =>
      defineTheme(tokens, 'fog', { color: { text: '#999' } }),
    ).toThrow('glyph: theme "fog": text on surface: 2.84:1, needs 4.5:1')
  })

  test("…and a base theme's pairs in the themes made from it", () => {
    const strong = defineTheme(tokens, 'strong', {
      contrastChecks: [['primary', 'surface', 'ui']],
    })
    expect(() =>
      defineTheme(tokens, 'washed', {
        from: strong,
        color: { primary: palette.blue[300] },
      }),
    ).toThrow('glyph: theme "washed": primary on surface: 1.8:1, needs 3:1')
  })

  test('light-dark pairs are measured in each scheme where they differ', () => {
    const dual = defineTokens({
      color: {
        text: { light: '#222', dark: '#555' },
        surface: { light: '#fff', dark: '#111' },
      },
    })
    expect(() =>
      defineTheme(dual, 'dim', {
        contrastChecks: [['text', 'surface', 'text']],
      }),
    ).toThrow('glyph: theme "dim": text on surface (dark): 2.53:1, needs 4.5:1')
  })

  test('a fixed scheme measures only that one', () => {
    const dual = defineTokens({
      color: {
        text: { light: '#222', dark: '#555' },
        surface: { light: '#fff', dark: '#111' },
      },
    })
    const light = defineTheme(dual, 'day', {
      colorScheme: 'light',
      contrastChecks: [['text', 'surface', 'text']],
    })
    expect(light.name).toBe('glyph.themes(day)')
  })

  test('a colour glyph cannot measure is named, not skipped', () => {
    expect(() =>
      defineTheme(tokens, 'mixed', {
        color: { text: 'color-mix(in oklch, red, blue)' },
      }),
    ).toThrow(
      'glyph: theme "mixed": text on surface: "color-mix(in oklch, red, blue)" is not a colour glyph can read',
    )
  })
})

describe('defineTheme: a mistake throws and says how to fix it', () => {
  test('a token that does not exist, with the nearest name', () => {
    expect(() =>
      // @ts-expect-error — no token "primry"
      defineTheme(tokens, 'typo', { color: { primry: '#f00' } }),
    ).toThrow(
      'glyph: theme "typo": color.primry: no such token; did you mean color.primary?',
    )
  })

  test('a group that does not exist', () => {
    expect(() =>
      // @ts-expect-error — no group "colour"
      defineTheme(tokens, 'typo', { colour: { text: '#000' } }),
    ).toThrow(
      'glyph: theme "typo": colour: no such token group; did you mean color?',
    )
  })

  test('a value of the wrong kind', () => {
    expect(() =>
      // @ts-expect-error — a dimension is text, such as "1rem"
      defineTheme(tokens, 'odd', { space: { m: 16 } }),
    ).toThrow(
      'glyph: theme "odd": space.m: 16 is not a CSS length such as "1rem"',
    )
  })

  test('a contrast pair naming a colour that does not exist', () => {
    expect(() =>
      defineTheme(tokens, 'odd', {
        // @ts-expect-error — no colour "on-primry"
        contrastChecks: [['on-primry', 'primary', 'text']],
      }),
    ).toThrow(
      'glyph: theme "odd": contrastChecks: "on-primry" is not a color token; did you mean on-primary?',
    )
  })

  test('a from made of other tokens: TS stops it, and so does glyph without TS', () => {
    const other = defineTokens({ color: { text: '#000', surface: '#fff' } })
    const otherNight = defineTheme(other, 'other-night', {})
    const later = defineTheme(other, 'later', { from: otherNight })
    // @ts-expect-error — a theme of other tokens
    expect(() => defineTheme(tokens, 'dusk', { from: later })).toThrow(
      'glyph: theme "dusk": from is a theme of other tokens; make it from the same tokens object',
    )
  })

  test('an empty name', () => {
    expect(() => defineTheme(tokens, '', {})).toThrow(
      `glyph: theme "": name: "" can't be a theme name; write some text, such as "night"`,
    )
  })

  test('a scheme that is neither light nor dark', () => {
    // @ts-expect-error — colorScheme is 'light' or 'dark'
    expect(() => defineTheme(tokens, 'dim', { colorScheme: 'dim' })).toThrow(
      'glyph: theme "dim": colorScheme: "dim" is not "light", "dark" or "inherit"',
    )
  })

  test('every mistake at once', () => {
    expect(() =>
      defineTheme(tokens, 'two', {
        // @ts-expect-error — no token "txt"
        color: { txt: '#000' },
        // @ts-expect-error — no token "l"
        space: { l: '2rem' },
      }),
    ).toThrow(
      'glyph: theme "two": color.txt: no such token; did you mean color.text?; space.l: no such token',
    )
  })
})
