import { describe, expect, test } from 'bun:test'
import { EasedCurve } from './curve'
import { cubicOut } from './easing/cubic'
import { fromCss } from './easing/css'
import { physicsOf, SpringCurve } from './spring'

/** Integrates m·x'' = −k·(x − 1) − c·x' in tiny steps: the physics, by brute force. */
function simulate(
  stiffness: number,
  damping: number,
  mass: number,
  v0: number,
  ms: number,
): number {
  let [x, v] = [0, v0]
  const dt = 1e-5
  for (let t = 0; t < ms / 1000; t += dt) {
    v += ((-stiffness * (x - 1) - damping * v) / mass) * dt
    x += v * dt
  }
  return x
}

describe('physicsOf (perceptual → physical, SwiftUI model)', () => {
  test('Spring(duration: 0.5, bounce: 0.3) is stiffness 157.9, damping 17.6', () => {
    const physics = physicsOf({ duration: 500, bounce: 0.3 })
    expect(physics.stiffness).toBeCloseTo(157.91, 2)
    expect(physics.damping).toBeCloseTo(17.59, 2)
    expect(physics.mass).toBe(1)
  })

  test('bounce 0 is critically damped', () => {
    const { stiffness, damping } = physicsOf({ duration: 400 })
    expect(damping).toBeCloseTo(2 * Math.sqrt(stiffness), 10)
  })

  test('the physical form passes through, mass 1 by default', () => {
    expect(physicsOf({ stiffness: 180, damping: 12 })).toEqual({
      stiffness: 180,
      damping: 12,
      mass: 1,
    })
  })

  test('out-of-range settings say what is allowed', () => {
    expect(() => physicsOf({ bounce: 1 })).toThrow('between -1 and 1')
    expect(() => physicsOf({ stiffness: 0, damping: 1 })).toThrow(
      'stiffness > 0',
    )
  })
})

describe('SpringCurve', () => {
  test.each([
    ['bouncy (underdamped)', { stiffness: 180, damping: 12, mass: 1 }],
    ['critical', { stiffness: 100, damping: 20, mass: 1 }],
    ['heavy (overdamped)', { stiffness: 100, damping: 40, mass: 2 }],
  ])('%s matches the brute-force physics', (_, options) => {
    const curve = new SpringCurve({ ...options, velocity: 3 })
    for (const ms of [50, 150, 300]) {
      const expected = simulate(
        options.stiffness,
        options.damping,
        options.mass,
        3,
        ms,
      )
      expect(curve.at(ms)).toBeCloseTo(expected, 3)
    }
  })

  test('velocityAt is the slope of at', () => {
    const curve = new SpringCurve({ duration: 400, bounce: 0.4 })
    const slope = ((curve.at(120.001) - curve.at(119.999)) / 0.002) * 1000
    expect(curve.velocityAt(120)).toBeCloseTo(slope, 2)
  })

  test('starts at 0 and rests at 1, with a computed duration', () => {
    const curve = new SpringCurve({ duration: 400, bounce: 0.2 })
    expect(curve.at(0)).toBe(0)
    expect(curve.duration).toBeGreaterThan(400)
    expect(curve.at(curve.duration)).toBe(1)
    expect(Math.abs(curve.at(curve.duration - 10) - 1)).toBeLessThan(0.002)
  })

  test('a bounce overshoots; bounce 0 does not', () => {
    const peak = (c: SpringCurve) =>
      Math.max(
        ...Array.from({ length: 100 }, (_, i) => c.at((i * c.duration) / 100)),
      )
    expect(
      peak(new SpringCurve({ duration: 400, bounce: 0.5 })),
    ).toBeGreaterThan(1.1)
    expect(peak(new SpringCurve({ duration: 400 }))).toBeLessThanOrEqual(1)
  })

  test('once resting it never swings back out past restDelta (it would snap)', () => {
    const options = { duration: 2000, bounce: 0.6 }
    const curve = new SpringCurve(options) // restDelta 0.001
    const longer = new SpringCurve({ ...options, restDelta: 0.0001 })
    for (let ms = curve.duration; ms < longer.duration; ms++) {
      expect(Math.abs(longer.at(ms) - 1)).toBeLessThan(0.001)
    }
  })

  test.each([
    ['bouncy', { duration: 400, bounce: 0.4 }],
    ['critical, overshooting from its speed', { duration: 400, velocity: 30 }],
    ['overdamped, overshooting', { stiffness: 100, damping: 40, velocity: 30 }],
  ])('%s: rests within restDelta of 1 from then on', (_, options) => {
    const curve = new SpringCurve(options)
    const longer = new SpringCurve({ ...options, restDelta: 1e-6 })
    for (let ms = curve.duration; ms < longer.duration; ms++) {
      expect(Math.abs(longer.at(ms) - 1)).toBeLessThan(0.001)
    }
  })

  test('a duration of 0 or below, or not a number, says what it takes', () => {
    for (const duration of [0, -500, NaN, Infinity]) {
      expect(() => new SpringCurve({ duration })).toThrow(
        "theater: a spring's duration is in ms and above 0",
      )
    }
  })

  test('a spring that never rests is refused', () => {
    expect(() => new SpringCurve({ stiffness: 100, damping: 0 })).toThrow(
      'still moving after 20 s',
    )
  })

  test('a slow, bouncy spring that rests after 10 s is still a spring (Motion allows 20 s)', () => {
    const curve = new SpringCurve({ duration: 5000, bounce: 0.5 })
    expect(curve.duration).toBeGreaterThan(10_000)
    expect(curve.at(curve.duration)).toBe(1)
  })

  test('as CSS, it reads back as itself', () => {
    const curve = new SpringCurve({ duration: 300, bounce: 0.3 })
    const back = fromCss(curve.toCss())
    expect(back(0.5)).toBeCloseTo(curve.at(curve.duration / 2), 3)
  })
})

describe('EasedCurve', () => {
  test('a duration of 0 is already at its end; before it, at its start', () => {
    const curve = new EasedCurve(cubicOut, 0)
    expect(curve.at(-10)).toBe(0)
    expect(curve.at(0)).toBe(1)
  })

  test('a negative or NaN duration says what it takes', () => {
    for (const duration of [-1, NaN]) {
      expect(() => new EasedCurve(cubicOut, duration)).toThrow(
        'theater: an animation lasts 0 ms or more',
      )
    }
  })

  test('reads its easing over its duration, 1 after it', () => {
    const curve = new EasedCurve(cubicOut, 400)
    expect(curve.at(200)).toBeCloseTo(0.875, 12)
    expect(curve.at(500)).toBe(1)
    expect(curve.velocityAt(0)).toBeCloseTo(7.5, 2) // cubicOut'(0) = 3, over 0.4 s
  })
})
