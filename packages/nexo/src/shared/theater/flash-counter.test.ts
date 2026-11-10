import { describe, expect, test } from 'bun:test'
import { countFlashes, luminance, type ColorSample } from './flash-counter'

/** `hz` alternations of two colours for two seconds (so a one-second window holds them whole), sampled at 60 fps. */
function blinking(
  hz: number,
  a: Omit<ColorSample, 't'>,
  b: Omit<ColorSample, 't'>,
): ColorSample[] {
  return Array.from({ length: 120 }, (_, i) => {
    const t = (i * 1000) / 60
    const on = Math.floor((t / 1000) * hz * 2) % 2 === 0
    return { t, ...(on ? a : b) }
  })
}

/** The grey whose relative luminance is `level` (the inverse of sRGB's curve). */
function grey(level: number): Omit<ColorSample, 't'> {
  const c =
    level <= 0.0031308 ? level * 12.92 : 1.055 * level ** (1 / 2.4) - 0.055
  return { r: c * 255, g: c * 255, b: c * 255 }
}

/** Two seconds of a luminance wave (level by second), sampled at 60 fps. */
function wave(levelAt: (second: number) => number): ColorSample[] {
  return Array.from({ length: 120 }, (_, i) => {
    const t = (i * 1000) / 60
    return { t, ...grey(levelAt(t / 1000)) }
  })
}

/** A wave between `low` and `high`, `hz` times a second, starting `phase` (0–1) into its cycle. */
type Wave = (
  low: number,
  high: number,
  hz: number,
  phase: number,
) => (second: number) => number

const sine: Wave = (low, high, hz, phase) => (s) =>
  low + ((high - low) * (1 + Math.sin(2 * Math.PI * (hz * s + phase)))) / 2

const triangle: Wave = (low, high, hz, phase) => (s) =>
  low + (high - low) * (1 - Math.abs((((hz * s + phase) * 2) % 2) - 1))

/** The counts of one wave started at sixteen points of its cycle. */
function countsOver(shape: (phase: number) => (second: number) => number) {
  const phases = Array.from({ length: 16 }, (_, i) => i / 16)
  return new Set(phases.map((p) => countFlashes(wave(shape(p))).perSecond))
}

const BLACK = { r: 0, g: 0, b: 0 }
const WHITE = { r: 255, g: 255, b: 255 }

describe('WCAG 2.3.1 counter', () => {
  test('relative luminance: black 0, white 1', () => {
    expect(luminance(BLACK)).toBe(0)
    expect(luminance(WHITE)).toBeCloseTo(1, 10)
  })

  test('black and white five times a second: five flashes', () => {
    expect(countFlashes(blinking(5, BLACK, WHITE)).perSecond).toBe(5)
  })

  test('twice a second: two, within the limit', () => {
    expect(countFlashes(blinking(2, BLACK, WHITE)).perSecond).toBe(2)
  })

  test('a small change in luminance is not a flash', () => {
    const grey = { r: 128, g: 128, b: 128 }
    const nearly = { r: 140, g: 140, b: 140 }
    expect(countFlashes(blinking(10, grey, nearly)).perSecond).toBe(0)
  })

  test('both states bright (darker over 0.80) is not a general flash', () => {
    const light = { r: 240, g: 240, b: 240 }
    expect(countFlashes(blinking(10, WHITE, light)).perSecond).toBe(0)
  })

  test('saturated red against grey of equal luminance: a red flash', () => {
    const red = { r: 255, g: 0, b: 0 }
    const grey = { r: 127, g: 127, b: 127 } // luminance close to the red's
    const count = countFlashes(blinking(5, red, grey))
    expect(count.red).toBe(true)
    expect(count.perSecond).toBeGreaterThan(3)
  })

  test('a smooth wave is measured from its real peaks and troughs, whatever its phase', () => {
    expect(countsOver((p) => sine(0, 0.2, 6, p))).toEqual(new Set([6]))
    expect(countsOver((p) => sine(0.1, 0.3, 5, p))).toEqual(new Set([5]))
    // At 8 Hz the samples miss every other peak by enough that only half
    // the swings reach 0.1 in the samples themselves: 4, not 8 — but never 0.
    expect(countsOver((p) => triangle(0.06, 0.18, 8, p))).toEqual(new Set([4]))
  })

  test('black and saturated red is a general and a red transition at once', () => {
    const red = { r: 255, g: 0, b: 0 }
    const count = countFlashes(blinking(10, BLACK, red))
    expect(count.red).toBe(true)
    expect(count.perSecond).toBe(10)
  })

  test('a slow ramp up and down once is one flash, not many', () => {
    const ramp = Array.from({ length: 61 }, (_, i) => {
      const level = Math.round(255 * (i <= 30 ? i / 30 : (60 - i) / 30))
      return { t: (i * 1000) / 60, r: level, g: level, b: level }
    })
    expect(countFlashes(ramp).perSecond).toBe(1)
  })
})
