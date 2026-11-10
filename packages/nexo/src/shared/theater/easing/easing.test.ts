import { describe, expect, test } from 'bun:test'
import { backIn, backInOut, backOut } from './back'
import { bounceOut } from './bounce'
import { fromCss } from './css'
import { cubicBezier } from './cubic-bezier'
import { inOut, linear, out } from './easing'
import { elasticOut } from './elastic'
import { linearPoints } from './linear-points'
import { quadIn, quadInOut, quadOut } from './quad'
import { steps } from './steps'
import { toCss } from './to-css'

describe('Penner families', () => {
  test('every curve starts at 0 and ends at 1', () => {
    for (const easing of [
      quadIn,
      quadOut,
      quadInOut,
      backIn,
      backOut,
      backInOut,
      bounceOut,
      elasticOut,
    ]) {
      expect(easing(0)).toBeCloseTo(0, 10)
      expect(easing(1)).toBeCloseTo(1, 10)
    }
  })

  test('out and inOut are mirrors of the in curve', () => {
    expect(out(quadIn)(0.25)).toBeCloseTo(1 - quadIn(0.75), 12)
    expect(inOut(quadIn)(0.25)).toBeCloseTo(quadIn(0.5) / 2, 12)
  })

  test('back pulls before 0 and overshoots past 1', () => {
    expect(backIn(0.2)).toBeLessThan(0)
    expect(backOut(0.8)).toBeGreaterThan(1)
  })
})

describe('cubic-bezier', () => {
  test('for any point on the curve, the easing at its x is its y', () => {
    const [x1, y1, x2, y2] = [0.2, 0.8, 0.2, 1]
    const ease = cubicBezier(x1, y1, x2, y2)
    for (const t of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const x = 3 * x1 * t * (1 - t) ** 2 + 3 * x2 * t * t * (1 - t) + t ** 3
      const y = 3 * y1 * t * (1 - t) ** 2 + 3 * y2 * t * t * (1 - t) + t ** 3
      expect(ease(x)).toBeCloseTo(y, 5)
    }
  })

  test('a flat start (slope 0 at x = 0) still solves', () => {
    expect(cubicBezier(0.42, 0, 1, 1)(0)).toBe(0)
    expect(cubicBezier(0.42, 0, 1, 1)(1)).toBeCloseTo(1, 6)
  })

  test('x outside [0, 1] is refused, as CSS does', () => {
    expect(() => cubicBezier(-0.1, 0, 1, 1)).toThrow(
      'theater: cubic-bezier x values',
    )
  })
})

describe('steps', () => {
  test('jump-end holds the start, jump-start jumps right away', () => {
    expect(steps(4, 'jump-end')(0.3)).toBe(0.25)
    expect(steps(4, 'jump-start')(0.3)).toBe(0.5)
    expect(steps(4, 'jump-end')(1)).toBe(1)
  })

  test('jump-none lands on both ends, jump-both on neither inside', () => {
    expect(steps(5, 'jump-none')(0)).toBe(0)
    expect(steps(5, 'jump-none')(1)).toBe(1)
    expect(steps(3, 'jump-both')(0)).toBe(0.25)
  })

  test('jump-none needs two steps', () => {
    expect(() => steps(1, 'jump-none')).toThrow('at least 2')
  })

  test('an unknown position says which ones there are', () => {
    expect(() => steps(4, 'sideways' as never)).toThrow('jump-start')
    expect(() => steps(4, 'constructor' as never)).toThrow(RangeError)
  })
})

describe('linear()', () => {
  test('stops without an input are spread evenly', () => {
    const easing = linearPoints([{ value: 0 }, { value: 0.25 }, { value: 1 }])
    expect(easing(0.25)).toBeCloseTo(0.125, 12)
    expect(easing(0.75)).toBeCloseTo(0.625, 12)
  })

  test('two stops at one input are a jump; the later value wins', () => {
    const easing = linearPoints([
      { value: 0 },
      { value: 0, at: 0.5 },
      { value: 1, at: 0.5 },
      { value: 1 },
    ])
    expect(easing(0.5)).toBe(1)
    expect(easing(0.49)).toBe(0)
  })

  test('an input lower than one before it is raised to it', () => {
    const easing = linearPoints([
      { value: 0 },
      { value: 0.5, at: 0.6 },
      { value: 0.8, at: 0.2 },
      { value: 1 },
    ])
    expect(easing(0.6)).toBe(0.8)
  })

  test('outside 0–1 the end lines keep their slope', () => {
    expect(linearPoints([{ value: 0 }, { value: 1 }])(1.5)).toBe(1.5)
  })
})

describe('fromCss', () => {
  test('keywords are their cubic-bezier()', () => {
    expect(fromCss('ease-out')(0.5)).toBeCloseTo(
      cubicBezier(0, 0, 0.58, 1)(0.5),
      12,
    )
    expect(fromCss(' Linear ')(0.3)).toBe(0.3)
  })

  test('functions are read from their arguments', () => {
    expect(fromCss('steps(4, jump-start)')(0.3)).toBe(0.5)
    expect(fromCss('linear(0, 0.25 75%, 1)')(0.75)).toBeCloseTo(0.25, 12)
    expect(fromCss('linear(0, 1 20% 80%, 0)')(0.5)).toBe(1)
  })

  test('anything else says what a CSS easing is', () => {
    expect(() => fromCss('outBack')).toThrow(
      'theater: "outBack" is not a CSS easing',
    )
    expect(() => fromCss('cubic-bezier(1, 2)')).toThrow('four numbers')
    expect(() => fromCss('linear(0, 1 0.5)')).toThrow('a percentage')
  })

  test('an empty or misspelled argument is a SyntaxError, not a number', () => {
    for (const css of [
      'cubic-bezier(,,,)',
      'cubic-bezier(0.2, x, 0.2, 1)',
      'linear(a, b)',
      'linear()',
      'linear(0, 1 20% 40% 60%)',
      'linear(0, 1 x%)',
      'steps(4, sideways)',
      'steps(, end)',
      'steps(4, end, start)',
      'constructor',
      'constructor(1)',
    ]) {
      expect(() => fromCss(css)).toThrow(SyntaxError)
    }
  })
})

describe('toCss', () => {
  test('a stop every 10 ms, four decimals', () => {
    expect(toCss(linear, 40)).toBe('linear(0, 0.25, 0.5, 0.75, 1)')
  })

  test('a duration that is not 0 ms or more says so', () => {
    for (const duration of [NaN, Infinity, -10]) {
      expect(() => toCss(linear, duration)).toThrow(
        'theater: toCss samples a duration of 0 ms or more',
      )
    }
  })

  test('the curve read back is the curve sampled', () => {
    const css = toCss(elasticOut, 600)
    const back = fromCss(css)
    expect(back(0.5)).toBeCloseTo(elasticOut(0.5), 3)
  })
})
