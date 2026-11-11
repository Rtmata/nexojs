import { describe, expect, test } from 'bun:test'
import { defineTokens } from './tokens'
import { typed } from './typed'

const ORDER =
  '@layer glyph.reset, glyph.base, glyph.tokens, glyph.themes, glyph.recipes;'

describe('defineTokens (B.1)', () => {
  test('each token is --<group>-<name>, read through its var()', () => {
    const tokens = defineTokens({
      color: { primary: '#3b82f6', 'on-primary': 'white' },
      space: { m: '1rem' },
    })
    expect(tokens.color.primary).toBe('var(--color-primary)')
    expect(tokens.color['on-primary']).toBe('var(--color-on-primary)')
    expect(tokens.space.m).toBe('var(--space-m)')
    expect(tokens.name).toBe('glyph.tokens(color, space)')
    expect(tokens.css).toBe(`${ORDER}
@layer glyph.tokens {
  :root {
    --color-primary: #3b82f6;
    --color-on-primary: white;
    --space-m: 1rem;
  }
}
`)
  })

  test('every known group, each written as its type', () => {
    const tokens = defineTokens({
      size: { control: '2.5rem' },
      radius: { s: '4px' },
      font: { body: 'system-ui, sans-serif' },
      weight: { bold: 700, normal: 'normal' },
      shadow: { low: '0 1px 2px #0003' },
      duration: { fast: 150 },
      easing: { out: 'cubic-bezier(0.2, 0, 0, 1)' },
      z: { modal: 100 },
    })
    expect(tokens.duration.fast).toBe('var(--duration-fast)')
    expect(tokens.css).toBe(`${ORDER}
@layer glyph.tokens {
  :root {
    --size-control: 2.5rem;
    --radius-s: 4px;
    --font-body: system-ui, sans-serif;
    --weight-bold: 700;
    --weight-normal: normal;
    --shadow-low: 0 1px 2px #0003;
    --duration-fast: 150ms;
    --easing-out: cubic-bezier(0.2, 0, 0, 1);
    --z-modal: 100;
  }
}
`)
  })

  test('a token pointing to another shows the chain in the CSS (B.2)', () => {
    const palette = defineTokens({
      blue: typed('color', { 300: '#93c5fd', 500: '#3b82f6' }),
      step: typed('duration', { base: 200 }),
    })
    const tokens = defineTokens({
      color: { primary: palette.blue[500] },
      duration: { fast: palette.step.base },
    })
    expect(palette.blue[500]).toBe('var(--blue-500)')
    expect(palette.name).toBe('glyph.tokens(blue, step)')
    expect(tokens.css).toBe(`${ORDER}
@layer glyph.tokens {
  :root {
    --color-primary: var(--blue-500);
    --duration-fast: var(--step-base);
  }
}
`)
  })

  test('a { light, dark } colour is light-dark(), and the root follows the scheme (C.3)', () => {
    const palette = defineTokens({ blue: typed('color', { 500: '#3b82f6' }) })
    const tokens = defineTokens({
      color: {
        text: { light: '#222', dark: '#eee' },
        primary: { light: palette.blue[500], dark: '#93c5fd' },
      },
    })
    expect(tokens.css).toBe(`${ORDER}
@layer glyph.tokens {
  :root {
    color-scheme: light dark;
    --color-text: light-dark(#222, #eee);
    --color-primary: light-dark(var(--blue-500), #93c5fd);
  }
}
`)
  })

  test('the token object is read-only', () => {
    const tokens = defineTokens({ color: { text: '#222' } })
    expect(Object.isFrozen(tokens)).toBe(true)
    expect(Object.isFrozen(tokens.color)).toBe(true)
  })
})

describe('defineTokens: a mistake throws and says how to fix it', () => {
  test('a group whose type is unknown (B.3)', () => {
    // @ts-expect-error — "brand" isn't a known group: TS asks for typed()
    expect(() => defineTokens({ brand: { main: '#f00' } })).toThrow(
      `glyph: "brand" is not a known token group (color, space, size, radius, font, weight, shadow, duration, easing, z); say its type: brand: typed('color', { … })`,
    )
  })

  test('a group named css or name, which the token object keeps for its sheet', () => {
    // @ts-expect-error — "css" would hide the sheet's own css
    expect(() => defineTokens({ css: typed('color', { a: 'red' }) })).toThrow(
      `glyph: a token group can't be called "css"`,
    )
  })

  test("a group named as one of defineTheme's options", () => {
    // @ts-expect-error — defineTheme(tokens, name, { from, … }) reads "from" as its base
    expect(() => defineTokens({ from: typed('color', { a: 'red' }) })).toThrow(
      `glyph: a token group can't be called "from": defineTheme reads it as an option, beside the groups`,
    )
  })

  test('a value of the wrong kind', () => {
    // @ts-expect-error — time is milliseconds, a number, in all of Nexo
    expect(() => defineTokens({ duration: { fast: '150ms' } })).toThrow(
      'glyph: duration.fast is "150ms"; a duration token is milliseconds as a number, such as 150',
    )
    // @ts-expect-error — a typed group checks its values too
    const layer = typed('number', { top: 'high' })
    expect(() => defineTokens({ layer })).toThrow(
      'glyph: layer.top is "high"; a number token is a number',
    )
  })

  test('a name that would need escaping in CSS', () => {
    expect(() => defineTokens({ space: { '1.5': '6px' } })).toThrow(
      "glyph: space.1.5 can't be part of a CSS custom property name; use letters, digits, - and _",
    )
  })

  test('a type typed() does not know', () => {
    // @ts-expect-error — "colour" is not a type
    const brand = typed('colour', { a: 'red' })
    expect(() => defineTokens({ brand })).toThrow(
      'glyph: typed(\'colour\', …) for "brand": the types are color, dimension, fontFamily, fontWeight, shadow, duration, easing, number',
    )
  })
})

test('the types: each leaf is the exact var() string, a typo is an error', () => {
  const tokens = defineTokens({ color: { primary: 'red' } })
  const primary: 'var(--color-primary)' = tokens.color.primary
  expect(primary).toBe('var(--color-primary)')
  // @ts-expect-error — no token "primry"
  expect(tokens.color.primry).toBeUndefined()
})

describe('defineTokens: contrast checks (C.5)', () => {
  test('a pair of the tokens that falls short throws, in each scheme it differs', () => {
    expect(() =>
      defineTokens(
        {
          color: {
            text: { light: '#222', dark: '#555' },
            surface: { light: '#fff', dark: '#111' },
          },
        },
        { contrastChecks: [['text', 'surface', 'text']] },
      ),
    ).toThrow('glyph: text on surface (dark): 2.53:1, needs 4.5:1')
  })

  test('a pair through a palette is measured once the palette is named', () => {
    const palette = defineTokens({ blue: typed('color', { 300: '#93c5fd' }) })
    const color = { primary: palette.blue[300], 'on-primary': '#fff' }
    const checks = [['on-primary', 'primary', 'ui']] as const
    expect(() =>
      defineTokens({ color }, { contrastChecks: checks, refersTo: [palette] }),
    ).toThrow('glyph: on-primary on primary: 1.8:1, needs 3:1')
    expect(() => defineTokens({ color }, { contrastChecks: checks })).toThrow(
      "glyph: on-primary on primary: --color-primary points to --blue-300, which these tokens don't define",
    )
  })

  test('a pair naming a colour that does not exist, or a use that is neither text nor ui', () => {
    expect(() =>
      defineTokens(
        { color: { text: '#000', surface: '#fff' } },
        // @ts-expect-error — no colour "surfce", no use "body"
        { contrastChecks: [['text', 'surfce', 'body']] },
      ),
    ).toThrow(
      'glyph: contrastChecks: "surfce" is not a color token; did you mean surface?; contrastChecks: "body" is not a use; write text or ui',
    )
  })

  test('a pair in another colour group is named group.name', () => {
    const brand = typed('color', { ink: '#777', paper: '#fff' })
    expect(() =>
      defineTokens(
        { color: { text: '#000' }, brand },
        { contrastChecks: [['brand.ink', 'brand.paper', 'text']] },
      ),
    ).toThrow('glyph: brand.ink on brand.paper: 4.47:1, needs 4.5:1')
  })

  test('group.name: a group that is not a colour group, or a token it lacks', () => {
    const groups = {
      color: { text: '#000' },
      brand: typed('color', { ink: '#000', paper: '#fff' }),
      space: { m: '1rem' },
    }
    const checks = [
      ['brnd.ink', 'space.m', 'text'],
      ['brand.inc', 'text', 'ui'],
    ] as const
    expect(() =>
      // @ts-expect-error — no colour group "brnd", space is not colour, no token "inc"
      defineTokens(groups, { contrastChecks: checks }),
    ).toThrow(
      'glyph: contrastChecks: "brnd" is not a color group of these tokens; did you mean brand?; contrastChecks: "space" is not a color group of these tokens; contrastChecks: "brand.inc" is not a color token; did you mean brand.ink?',
    )
  })

  test('pairs that pass: the tokens are made', () => {
    const tokens = defineTokens(
      { color: { text: '#222', surface: '#fff' } },
      { contrastChecks: [['text', 'surface', 'text']] },
    )
    expect(tokens.color.text).toBe('var(--color-text)')
  })
})
