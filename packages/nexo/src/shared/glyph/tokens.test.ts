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
      'glyph: typed(\'colour\', …) for "brand": the types are color, dimension, fontFamily, fontWeight, shadow, duration, cubicBezier, number',
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
