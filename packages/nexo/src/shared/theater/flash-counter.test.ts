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

  test('a slow ramp up and down once is one flash, not many', () => {
    const ramp = Array.from({ length: 61 }, (_, i) => {
      const level = Math.round(255 * (i <= 30 ? i / 30 : (60 - i) / 30))
      return { t: (i * 1000) / 60, r: level, g: level, b: level }
    })
    expect(countFlashes(ramp).perSecond).toBe(1)
  })
})
