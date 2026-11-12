import { describe, expect, test } from 'bun:test'
import { resolve } from '../resolve'
import { defineTokens } from '../tokens'
import { typed } from '../typed'
import { readDtcg } from './read-dtcg'
import { writeDtcg } from './write-dtcg'

const palette = defineTokens({ blue: typed('color', { 700: '#1d4ed8' }) })
const tokens = defineTokens(
  {
    color: {
      primary: palette.blue[700],
      text: { light: '#222222', dark: '#eeeeee' },
    },
    space: { m: '1rem', zero: '0' },
    font: { body: '"Inter", sans-serif' },
    weight: { bold: 'bold' },
    shadow: { low: '0 1px 2px var(--blue-700), inset 0 0 0 1px #000000' },
    duration: { fast: 150 },
    easing: { out: 'ease-out', snap: 'cubic-bezier(0.2, 0, 0, 1)' },
    z: { top: 10 },
  },
  { refersTo: [palette] },
)

describe('writeDtcg', () => {
  test('each group with its $type, references as {group.token}', () => {
    const { tokens: json } = writeDtcg(palette, tokens)
    expect(json.blue).toEqual({
      $type: 'color',
      700: {
        $value: {
          colorSpace: 'srgb',
          components: [0.1137, 0.3059, 0.8471],
          hex: '#1d4ed8',
        },
      },
    })
    expect(json.color).toMatchObject({
      $type: 'color',
      primary: { $value: '{blue.700}' },
    })
    expect(json.space).toEqual({
      $type: 'dimension',
      m: { $value: { value: 1, unit: 'rem' } },
      zero: { $value: { value: 0, unit: 'px' } },
    })
    expect(json.font).toEqual({
      $type: 'fontFamily',
      body: { $value: ['Inter', 'sans-serif'] },
    })
    expect(json.weight).toEqual({ $type: 'fontWeight', bold: { $value: 700 } })
    expect(json.duration).toEqual({
      $type: 'duration',
      fast: { $value: { value: 150, unit: 'ms' } },
    })
    expect(json.easing).toEqual({
      $type: 'cubicBezier',
      out: { $value: [0, 0, 0.58, 1] },
      snap: { $value: [0.2, 0, 0, 1] },
    })
    expect(json.z).toEqual({ $type: 'number', top: { $value: 10 } })
    expect(json.shadow).toEqual({
      $type: 'shadow',
      low: {
        $value: [
          {
            color: '{blue.700}',
            offsetX: { value: 0, unit: 'px' },
            offsetY: { value: 1, unit: 'px' },
            blur: { value: 2, unit: 'px' },
            spread: { value: 0, unit: 'px' },
          },
          {
            color: {
              colorSpace: 'srgb',
              components: [0, 0, 0],
              hex: '#000000',
            },
            offsetX: { value: 0, unit: 'px' },
            offsetY: { value: 0, unit: 'px' },
            blur: { value: 0, unit: 'px' },
            spread: { value: 1, unit: 'px' },
            inset: true,
          },
        ],
      },
    })
  })

  test('{ light, dark } colours: the light value in the file, both in a resolver', () => {
    const { tokens: json, resolver } = writeDtcg(palette, tokens)
    expect((json.color as any).text.$value.hex).toBe('#222222')
    expect(resolver).toMatchObject({
      version: '2025-10-01',
      modifiers: {
        colorScheme: {
          default: 'light',
          contexts: {
            dark: [
              {
                color: { $type: 'color', text: { $value: { hex: '#eeeeee' } } },
              },
            ],
          },
        },
      },
      resolutionOrder: [
        { $ref: '#/sets/tokens' },
        { $ref: '#/modifiers/colorScheme' },
      ],
    })
    expect(writeDtcg(palette).resolver).toBeUndefined()
  })

  test('what DTCG has no form for: every mistake in one message', () => {
    const odd = defineTokens({
      space: { m: '1em' },
      easing: { step: 'steps(4)' },
      color: { mix: 'color-mix(in oklch, red, blue)', lost: 'var(--nowhere)' },
    })
    expect(() => writeDtcg(odd)).toThrow(
      'glyph: writeDtcg: space.m: "1em" has no DTCG form; DTCG dimensions are px or rem; easing.step: "steps(4)" has no DTCG form; DTCG easings are cubic-bezier curves; color.mix: "color-mix(in oklch, red, blue)" is a colour glyph can\'t read, so it has no DTCG form; color.lost: var(--nowhere) points to a token none of these define; pass its token object too',
    )
  })
})

describe('readDtcg', () => {
  test("glyph's own output reads back to the same values", () => {
    const { resolver } = writeDtcg(palette, tokens)
    const back = readDtcg(resolver)
    const original = resolve(tokens, { colorScheme: 'dark' }).values
    const again = resolve(back, { colorScheme: 'dark' }).values
    expect(again['color-text']).toBe('#eeeeee')
    expect(again['color-primary']).toBe('#1d4ed8')
    expect(again['space-m']).toBe(original['space-m'])
    expect(again['duration-fast']).toBe('150ms')
    expect(again['easing-out']).toBe('cubic-bezier(0, 0, 0.58, 1)')
  })

  test('a file as the spec writes it: nested groups, inherited $type, $root, $ref, s, weight words', () => {
    const back = readDtcg({
      color: {
        $type: 'color',
        blue: {
          500: { $value: { colorSpace: 'oklch', components: [0.6, 0.2, 250] } },
        },
        accent: {
          $root: { $value: '{color.blue.500}' },
          soft: {
            $value: { colorSpace: 'srgb', components: [1, 1, 1], alpha: 0.5 },
          },
        },
        link: { $value: { $ref: '#/color/blue/500' } },
      },
      motion: {
        slow: { $type: 'duration', $value: { value: 0.4, unit: 's' } },
      },
      weight: { $type: 'fontWeight', heading: { $value: 'semi-bold' } },
      font: {
        $type: 'fontFamily',
        ui: { $value: ['Inter Display', 'system-ui'] },
      },
    })
    expect(back.css).toContain('--color-blue-500: oklch(0.6 0.2 250);')
    expect(back.css).toContain('--color-accent: var(--color-blue-500);')
    expect(back.css).toContain('--color-accent-soft: rgb(255 255 255 / 0.5);')
    expect(back.css).toContain('--color-link: var(--color-blue-500);')
    expect(back.css).toContain('--motion-slow: 400ms;')
    expect(back.css).toContain('--weight-heading: 600;')
    expect(back.css).toContain('--font-ui: "Inter Display", system-ui;')
  })

  test('what glyph has no form for: every mistake in one message', () => {
    expect(() =>
      readDtcg({
        color: {
          $type: 'color',
          base: { $value: { colorSpace: 'srgb', components: [0, 0, 0] } },
          part: {
            $value: {
              colorSpace: 'srgb',
              components: [{ $ref: '#/color/base/$value/components/0' }, 0, 0],
            },
          },
          hue: { $value: { $ref: '#/color/base/$value/components/0' } },
        },
        theme: { $extends: '{color}' },
        fade: { $type: 'gradient', a: { $value: [] } },
        space: { $type: 'number', m: { $value: 4 } },
        lonely: { $type: 'number', $value: 1 },
      }),
    ).toThrow(
      "glyph: readDtcg: theme: $extends isn't read by glyph; write the group's tokens out; color.part: a colour's components are numbers or none; a $ref inside a value isn't read by glyph; color.hue: a $ref to part of a value (#/color/base/$value/components/0) isn't read by glyph; point to a whole token; fade.a: glyph has no gradient tokens; lonely: a token sits in a group in glyph; put it in one; space: in glyph the group space holds dimension tokens, the file gives number",
    )
  })
})
