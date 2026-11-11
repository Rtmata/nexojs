import { describe, expect, test } from 'bun:test'
import { defineTheme } from './theme'
import { themeFrom } from './theme-from'
import { defineTokens } from './tokens'

const tokens = defineTokens(
  {
    color: {
      text: '#222',
      surface: '#fff',
      primary: '#1d4ed8',
      'on-primary': '#fff',
    },
    space: { m: '1rem' },
    duration: { fast: 150 },
  },
  { contrastChecks: [['on-primary', 'primary', 'text']] },
)

describe('themeFrom (C.4)', () => {
  test('a valid JSON gives the same theme defineTheme makes', () => {
    const json = JSON.parse(
      '{ "name": "sea", "colorScheme": "dark", "color": { "surface": "#012", "text": "#eee" } }',
    )
    const result = themeFrom(tokens, json)
    const written = defineTheme(tokens, 'sea', {
      colorScheme: 'dark',
      color: { surface: '#012', text: '#eee' },
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.theme.css).toBe(written.css)
  })

  test('every mistake, each saying what and where', () => {
    const result = themeFrom(tokens, {
      name: 'mine',
      color: {
        primry: '#f00',
        surface: '#12',
        text: { light: '#000', dark: 5 },
      },
      colour: {},
      duration: { fast: '150ms' },
    })
    expect(result).toEqual({
      ok: false,
      errors: [
        'color.primry: no such token; did you mean color.primary?',
        'color.surface: "#12" is not a colour glyph can read; write hex, rgb(), hsl(), oklch(), oklab() or a CSS colour name',
        'color.text: 5 is not a colour',
        'colour: no such token group; did you mean color?',
        'duration.fast: "150ms" is not milliseconds as a number, such as 150',
      ],
    })
  })

  test('colours are read: a token or CSS only the page resolves is not one', () => {
    const result = themeFrom(tokens, {
      name: 'mine',
      color: { text: 'var(--color-primary)', surface: 'currentColor' },
    })
    expect(result).toEqual({
      ok: false,
      errors: [
        'color.text: "var(--color-primary)" is a token, not a colour; colour maths needs the colour itself',
        'color.surface: "currentColor" is not a colour glyph can read; write hex, rgb(), hsl(), oklch(), oklab() or a CSS colour name',
      ],
    })
  })

  test('text that would leave its declaration is refused', () => {
    const result = themeFrom(tokens, {
      name: 'mine',
      space: { m: '1rem } body { display: none' },
    })
    expect(result).toEqual({
      ok: false,
      errors: [
        `space.m: "1rem } body { display: none" can't be a CSS value here: ; { } < > \\, line breaks and unclosed quotes aren't allowed`,
      ],
    })
  })

  test("the tokens' pairs that fall short are among its errors (C.5)", () => {
    const result = themeFrom(tokens, {
      name: 'pale',
      color: { primary: '#93c5fd' },
    })
    expect(result).toEqual({
      ok: false,
      errors: ['on-primary on primary: 1.8:1, needs 4.5:1'],
    })
  })

  test('a translucent colour in a checked pair is an error, not a throw', () => {
    const result = themeFrom(tokens, {
      name: 'glass',
      color: { 'on-primary': 'rgb(255 255 255 / 50%)' },
    })
    expect(result).toEqual({
      ok: false,
      errors: [
        'on-primary on primary: "rgb(255 255 255 / 50%)" is translucent; contrast needs opaque colours, since what shows through changes it',
      ],
    })
  })

  test('the name and the scheme are checked too', () => {
    expect(themeFrom(tokens, { colorScheme: 'dim' })).toEqual({
      ok: false,
      errors: [
        `name: undefined can't be a theme name; use letters, digits, - and _, such as "night"`,
        'colorScheme: "dim" is not "light", "dark" or "inherit"',
      ],
    })
  })

  test('JSON that is not an object', () => {
    expect(themeFrom(tokens, ['sea'])).toEqual({
      ok: false,
      errors: ['theme: ["sea"] is not an object'],
    })
  })
})
