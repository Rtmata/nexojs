import { describe, expect, test } from 'bun:test'
import { colorMix } from './mix'

describe('colorMix: CSS color-mix(in oklch, a p%, b), computed (C.5)', () => {
  test('the percent is how much of the first colour', () => {
    expect(colorMix('red', 'blue', 100)).toBe('oklch(0.628 0.2577 29.23)')
    expect(colorMix('#3b82f6', 'white', 20)).toBe('oklch(0.9246 0.0376 259.81)')
  })

  test('between two hues, the shorter way round', () => {
    // red at 29°, blue at 264°: the short arc passes 0°, not 146°
    expect(colorMix('red', 'blue', 50)).toBe('oklch(0.54 0.2854 326.64)')
  })

  test('a grey takes the other colour’s hue', () => {
    expect(colorMix('red', 'white', 0)).toBe('oklch(1 0 29.23)')
  })

  test('alpha is premultiplied, and written only when not 1', () => {
    expect(colorMix('red', 'transparent', 50)).toBe(
      'oklch(0.628 0.2577 29.23 / 0.5)',
    )
  })

  test('a percent outside 0–100 throws', () => {
    expect(() => colorMix('red', 'blue', 120)).toThrow(
      "glyph: colorMix's percent is 120; write 0 to 100, how much of the first colour",
    )
  })
})
