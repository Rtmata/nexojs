import { describe, expect, test } from 'bun:test'
import { readColor } from './read'
import { oklabToOklch, rgbToOklab } from './spaces'

/** Channels as 0–255, rounded, for comparing with what CSS writes. */
function bytes(text: string): number[] {
  const { red, green, blue, alpha } = readColor(text)
  // + 0 turns -0 (a channel a hair below 0) into 0
  return [red, green, blue].map((c) => Math.round(c * 255) + 0).concat(alpha)
}

describe('readColor reads every way CSS writes an sRGB colour', () => {
  test.each([
    ['#f00', [255, 0, 0, 1]],
    ['#F00', [255, 0, 0, 1]],
    ['#3b82f6', [59, 130, 246, 1]],
    ['#ff000080', [255, 0, 0, 128 / 255]],
    ['#f008', [255, 0, 0, 136 / 255]],
    ['rgb(59, 130, 246)', [59, 130, 246, 1]],
    ['rgb(59 130 246)', [59, 130, 246, 1]],
    ['rgba(255, 0, 0, 0.5)', [255, 0, 0, 0.5]],
    ['rgb(255 0 0 / 50%)', [255, 0, 0, 0.5]],
    ['rgb(100% 50% 0%)', [255, 128, 0, 1]],
    ['rgb(300 -5 0)', [255, 0, 0, 1]], // clamped, as CSS does
    ['hsl(120 100% 25%)', [0, 128, 0, 1]],
    ['hsl(120, 100%, 25%)', [0, 128, 0, 1]],
    ['hsl(120 100 25)', [0, 128, 0, 1]],
    ['hsla(0.5turn, 50%, 50%, .5)', [64, 191, 191, 0.5]],
    ['hsl(-120deg 100% 50%)', [0, 0, 255, 1]],
    ['rebeccapurple', [102, 51, 153, 1]],
    ['White', [255, 255, 255, 1]],
    ['transparent', [0, 0, 0, 0]],
  ])('%s', (text, expected) => {
    expect(bytes(text)).toEqual(expected as number[])
  })
})

describe('OKLCH and OKLab (C.5)', () => {
  // CSS Color 4 §9.3 writes sRGB red as oklch(62.8% 0.2577 29.23).
  test('red is oklch(0.628 0.2577 29.23), both ways', () => {
    const red = oklabToOklch(rgbToOklab(readColor('red')))
    expect(red.lightness).toBeCloseTo(0.628, 3)
    expect(red.chroma).toBeCloseTo(0.2577, 4)
    expect(red.hue).toBeCloseTo(29.23, 2)
    expect(bytes('oklch(62.8% 0.2577 29.23deg)')).toEqual([255, 0, 0, 1])
    expect(bytes('oklch(0.628 0.2577 29.23)')).toEqual([255, 0, 0, 1])
  })

  test('a grey has no hue: white is L 1, no chroma, hue null', () => {
    const white = oklabToOklch(rgbToOklab(readColor('white')))
    expect(white.lightness).toBeCloseTo(1, 6)
    expect(white.chroma).toBeCloseTo(0, 6)
    expect(white.hue).toBeNull()
  })

  test('oklab() and percentages in oklch()', () => {
    expect(bytes('oklab(0.628 0.2249 0.1258)')).toEqual([255, 0, 0, 1])
    expect(bytes('oklch(100% 0% 0)')).toEqual([255, 255, 255, 1])
    expect(bytes('oklch(0 0 none / 25%)')).toEqual([0, 0, 0, 0.25])
  })

  test('a colour outside sRGB keeps its channels beyond 0–1', () => {
    const { red, blue } = readColor('oklch(0.7 0.4 145)')
    expect(Math.min(red, blue)).toBeLessThan(0)
  })

  test('sRGB → OKLab → sRGB returns the same colour', () => {
    const color = readColor('#3b82f6')
    const lab = rgbToOklab(color)
    expect(bytes(`oklab(${lab.lightness} ${lab.a} ${lab.b})`)).toEqual(
      bytes('#3b82f6'),
    )
  })
})

describe('readColor: what it cannot read throws', () => {
  test.each([
    '#12',
    'rgb(1 2)',
    'rgb(1deg 2 3)',
    'hsl(10% 5% 5%)',
    'notacolor',
    'currentColor',
    'color-mix(in oklch, red, blue)',
    'rgb(1x 2 3)',
  ])('%s', (text) => {
    expect(() => readColor(text)).toThrow(
      `glyph: "${text}" is not a colour glyph can read; write hex, rgb(), hsl(), oklch(), oklab() or a CSS colour name`,
    )
  })

  test('a token reference says it needs the colour itself', () => {
    expect(() => readColor('var(--blue-500)')).toThrow(
      'glyph: "var(--blue-500)" is a token, not a colour; colour maths needs the colour itself',
    )
  })
})
