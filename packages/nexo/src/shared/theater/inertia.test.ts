import { describe, expect, test } from 'bun:test'
import { InertiaPath } from './inertia'

/** The path every 10 ms, and where it rests. */
function every10ms(path: InertiaPath): number[] {
  const count = Math.floor(path.duration / 10)
  const times = Array.from({ length: count + 1 }, (_, i) => i * 10)
  return [...times, path.duration].map((ms) => path.valueAt(ms))
}

describe('InertiaPath', () => {
  test('starts at the release speed times power, and slows down', () => {
    const path = new InertiaPath(0, {
      velocity: 1000,
      power: 1,
      timeConstant: 500,
    })
    expect(path.velocityAt(0)).toBeCloseTo(1000, 6)
    expect(path.velocityAt(500)).toBeCloseTo(1000 / Math.E, 6)
    expect(path.to).toBeCloseTo(500, 6) // velocity × time constant
  })

  test('defaults: power 0.8, time constant 700 ms', () => {
    const path = new InertiaPath(100, { velocity: 1800 })
    expect(path.to).toBeCloseTo(100 + 0.8 * 1800 * 0.7, 6)
  })

  test('rests when the gap left is under half a pixel', () => {
    const path = new InertiaPath(0, {
      velocity: 1000,
      power: 1,
      timeConstant: 500,
    })
    expect(Math.abs(path.valueAt(path.duration) - path.to)).toBeLessThanOrEqual(
      0.5,
    )
    expect(
      Math.abs(path.valueAt(path.duration - 50) - path.to),
    ).toBeGreaterThan(0.5)
  })

  test('snap moves the target: to the nearest point, or by a function', () => {
    const points = new InertiaPath(0, {
      velocity: 1000,
      power: 1,
      timeConstant: 500,
      snap: [0, 440, 660],
    })
    expect(points.to).toBe(440)
    const grid = new InertiaPath(0, {
      velocity: 1000,
      power: 1,
      timeConstant: 500,
      snap: (x) => Math.round(x / 220) * 220,
    })
    expect(grid.to).toBe(440)
  })

  test('at an edge it hands its speed to the edge spring and rests on the edge', () => {
    const path = new InertiaPath(-100, {
      velocity: 1800,
      bounds: { min: -4000, max: 0 },
    })
    expect(path.to).toBe(0)
    const samples = every10ms(path)
    expect(Math.max(...samples)).toBeGreaterThan(0) // it overshoots the edge…
    expect(samples.at(-1)!).toBeCloseTo(0, 0) // …and comes back to it
  })

  test('starting outside the bounds springs straight back', () => {
    const path = new InertiaPath(50, { velocity: 0, bounds: { max: 0 } })
    expect(path.to).toBe(0)
    expect(path.valueAt(0)).toBe(50)
    expect(path.valueAt(path.duration)).toBeCloseTo(0, 0)
  })

  test('the speed is continuous where the decay meets the edge spring', () => {
    const path = new InertiaPath(-100, { velocity: 1800, bounds: { max: 0 } })
    const hit = every10ms(path).findIndex((v) => v >= 0) * 10
    expect(path.velocityAt(hit - 1)).toBeCloseTo(path.velocityAt(hit + 1), -2)
  })

  test('released right on an edge, outward: the edge spring gets the decay speed, not the raw one', () => {
    const path = new InertiaPath(0, {
      velocity: 1000,
      power: 0.5,
      bounds: { max: 0 },
    })
    expect(path.velocityAt(0)).toBeCloseTo(500, 6) // power × velocity, as inside
  })

  test('a timeConstant of 0 or below says what it takes', () => {
    for (const timeConstant of [0, -700, NaN]) {
      expect(() => new InertiaPath(0, { velocity: 1, timeConstant })).toThrow(
        "theater: inertia's timeConstant is in ms and above 0",
      )
    }
  })

  test('no velocity inside the bounds: already resting', () => {
    expect(new InertiaPath(10, {}).duration).toBe(0)
  })
})
