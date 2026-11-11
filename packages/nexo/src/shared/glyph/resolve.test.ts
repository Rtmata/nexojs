import { describe, expect, test } from 'bun:test'
import { resolve } from './resolve'
import { defineTheme } from './theme'
import { defineTokens } from './tokens'
import { typed } from './typed'

const palette = defineTokens({
  blue: typed('color', { 300: '#93c5fd', 700: '#1d4ed8' }),
  ink: typed('color', { main: 'var(--blue-700)' }), // a palette may point into itself
})

const tokens = defineTokens(
  {
    color: {
      text: { light: '#222', dark: '#eee' },
      surface: { light: '#fff', dark: '#111' },
      primary: { light: palette.ink.main, dark: palette.blue[300] },
    },
    shadow: { low: '0 1px 2px var(--color-text)' },
    duration: { fast: 150 },
  },
  { refersTo: [palette] },
)

describe('resolve (C.6)', () => {
  test('references followed, the scheme picked, every token by its property name', () => {
    expect(resolve(tokens, { colorScheme: 'light' }).values).toEqual({
      'color-text': '#222',
      'color-surface': '#fff',
      'color-primary': '#1d4ed8',
      'shadow-low': '0 1px 2px #222',
      'duration-fast': '150ms',
    })
    expect(
      resolve(tokens, { colorScheme: 'dark' }).values['color-primary'],
    ).toBe('#93c5fd')
  })

  test("a theme's own values, references resolved against the theme", () => {
    const sea = defineTheme(tokens, 'sea', {
      colorScheme: 'dark',
      color: { text: '#cde' },
    })
    expect(resolve(sea, { colorScheme: 'dark' }).values['shadow-low']).toBe(
      '0 1px 2px #cde',
    )
  })

  test('.css(): :root with the final values, for a document glyph does not reach', () => {
    expect(resolve(tokens, { colorScheme: 'dark' }).css()).toBe(`:root {
  color-scheme: dark;
  --color-text: #eee;
  --color-surface: #111;
  --color-primary: #93c5fd;
  --shadow-low: 0 1px 2px #eee;
  --duration-fast: 150ms;
}
`)
  })

  test('a theme that fixes its scheme answers only for it', () => {
    const night = defineTheme(tokens, 'night', { colorScheme: 'dark' })
    expect(() => resolve(night, { colorScheme: 'light' })).toThrow(
      "glyph: resolve: this theme is always dark; ask for colorScheme: 'dark'",
    )
  })

  test('a reference into tokens it was not told about names the fix', () => {
    const alone = defineTokens({ color: { primary: palette.blue[700] } })
    expect(() => resolve(alone, { colorScheme: 'light' })).toThrow(
      "glyph: --color-primary points to --blue-700, which these tokens don't define; if another token object does (a palette), name it: defineTokens({ … }, { refersTo: [palette] })",
    )
  })

  test('references that go round in a circle', () => {
    const loop = defineTokens({
      color: { a: 'var(--color-b)', b: 'var(--color-a)' },
    })
    expect(() => resolve(loop, { colorScheme: 'light' })).toThrow(
      'glyph: --color-a points back to itself (--color-a → --color-b → --color-a); one of them needs a value',
    )
  })

  test('the types: values keyed by property name, a typo is an error', () => {
    const values = resolve(tokens, { colorScheme: 'light' }).values
    const surface: string = values['color-surface']
    expect(surface).toBe('#fff')
    // @ts-expect-error — no token "color-surfce"
    expect(values['color-surfce']).toBeUndefined()
  })
})
