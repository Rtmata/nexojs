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

describe('themeFrom', () => {
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
        {
          path: 'color.primry',
          code: 'unknownToken',
          data: { name: 'primry', suggestion: 'primary' },
          message: 'color.primry: no such token; did you mean color.primary?',
        },
        {
          path: 'color.surface',
          code: 'notAColor',
          data: { value: '#12' },
          message:
            'color.surface: "#12" is not a colour glyph can read; write hex, rgb(), hsl(), oklch(), oklab() or a CSS colour name',
        },
        {
          path: 'color.text',
          code: 'notAColor',
          data: { value: 5 },
          message: 'color.text: 5 is not a colour',
        },
        {
          path: 'colour',
          code: 'unknownGroup',
          data: { name: 'colour', suggestion: 'color' },
          message: 'colour: no such token group; did you mean color?',
        },
        {
          path: 'duration.fast',
          code: 'wrongKind',
          data: { value: '150ms', expected: 'duration' },
          message:
            'duration.fast: "150ms" is not milliseconds as a number, such as 150',
        },
      ],
    })
  })

  test('colours are read; a reference must name a colour token', () => {
    const result = themeFrom(tokens, {
      name: 'mine',
      color: {
        text: 'var(--color-primry)',
        surface: 'currentColor',
        primary: 'var(--space-m)',
      },
    })
    expect(result).toEqual({
      ok: false,
      errors: [
        {
          path: 'color.text',
          code: 'missingReference',
          data: {
            value: 'var(--color-primry)',
            name: 'color-primry',
            suggestion: 'color-primary',
          },
          message:
            'color.text: "var(--color-primry)" points to --color-primry, which these tokens don\'t define; did you mean --color-primary?',
        },
        {
          path: 'color.surface',
          code: 'notAColor',
          data: { value: 'currentColor' },
          message:
            'color.surface: "currentColor" is not a colour glyph can read; write hex, rgb(), hsl(), oklch(), oklab() or a CSS colour name',
        },
        {
          path: 'color.primary',
          code: 'wrongKind',
          data: { value: 'var(--space-m)', expected: 'color' },
          message:
            'color.primary: "var(--space-m)" is a dimension token, not a CSS colour or { light, dark }',
        },
      ],
    })
  })

  test('a reference to a token of its type is followed, contrast included', () => {
    const same = themeFrom(tokens, {
      name: 'mine',
      color: { 'on-primary': 'var(--color-primary)' },
    })
    expect(same).toMatchObject({
      ok: false,
      errors: [
        { path: 'color.on-primary', code: 'lowContrast', data: { ratio: 1 } },
      ],
    })
    const fine = themeFrom(tokens, {
      name: 'mine',
      color: { surface: 'var(--color-on-primary)' },
      space: { m: 'calc(1rem * 2)' },
    })
    expect(fine.ok).toBe(true)
  })

  test('references that loop back are one error, at the first token in the loop', () => {
    const result = themeFrom(tokens, {
      name: 'loop',
      color: {
        surface: 'var(--color-primary)',
        primary: 'var(--color-surface)',
      },
    })
    expect(result).toEqual({
      ok: false,
      errors: [
        {
          path: 'color.surface',
          code: 'referenceCycle',
          data: { chain: ['color-surface', 'color-primary', 'color-surface'] },
          message:
            'color.surface: --color-surface points back to itself (--color-surface → --color-primary → --color-surface); one of them needs a value',
        },
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
        {
          path: 'space.m',
          code: 'unsafeText',
          data: { value: '1rem } body { display: none' },
          message: `space.m: "1rem } body { display: none" can't be a CSS value here: ; { } < > \\, line breaks and unclosed quotes aren't allowed`,
        },
      ],
    })
  })

  test("the tokens' pairs that fall short are among its errors", () => {
    const result = themeFrom(tokens, {
      name: 'pale',
      color: { primary: '#93c5fd' },
    })
    expect(result).toEqual({
      ok: false,
      errors: [
        {
          path: 'color.on-primary',
          code: 'lowContrast',
          data: { background: 'color.primary', ratio: 1.8, required: 4.5 },
          message: 'on-primary on primary: 1.8:1, needs 4.5:1',
        },
      ],
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
        {
          path: 'color.on-primary',
          code: 'translucent',
          data: { value: 'rgb(255 255 255 / 50%)' },
          message:
            'on-primary on primary: "rgb(255 255 255 / 50%)" is translucent; contrast needs opaque colours, since what shows through changes it',
        },
      ],
    })
  })

  test('the name and the scheme are checked too', () => {
    expect(themeFrom(tokens, { colorScheme: 'dim' })).toEqual({
      ok: false,
      errors: [
        {
          path: 'name',
          code: 'badName',
          data: { value: undefined },
          message: `name: undefined can't be a theme name; write some text, such as "night"`,
        },
        {
          path: 'colorScheme',
          code: 'badColorScheme',
          data: { value: 'dim', allowed: ['light', 'dark', 'inherit'] },
          message: 'colorScheme: "dim" is not "light", "dark" or "inherit"',
        },
      ],
    })
  })

  test('a pair measured in both schemes says which; a group that is not an object', () => {
    const dual = defineTokens(
      {
        color: {
          text: { light: '#222', dark: '#eee' },
          surface: { light: '#fff', dark: '#111' },
        },
      },
      { contrastChecks: [['text', 'surface', 'text']] },
    )
    expect(
      themeFrom(dual, {
        name: 'dim',
        color: { text: { light: '#222', dark: '#444' } },
      }),
    ).toEqual({
      ok: false,
      errors: [
        {
          path: 'color.text',
          code: 'lowContrast',
          data: {
            background: 'color.surface',
            scheme: 'dark',
            ratio: 1.93,
            required: 4.5,
          },
          message: 'text on surface (dark): 1.93:1, needs 4.5:1',
        },
      ],
    })
    expect(themeFrom(dual, { name: 'x', color: 'red' })).toMatchObject({
      errors: [{ path: 'color', code: 'notAnObject', data: { value: 'red' } }],
    })
  })

  test('JSON that is not an object', () => {
    expect(themeFrom(tokens, ['sea'])).toEqual({
      ok: false,
      errors: [
        {
          path: '',
          code: 'notAnObject',
          data: { value: ['sea'] },
          message: 'theme: ["sea"] is not an object',
        },
      ],
    })
  })
})
