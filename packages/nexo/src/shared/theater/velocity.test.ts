import { describe, expect, test } from 'bun:test'
import { recentOf, speed, type Sample } from './velocity'

/** A pointer moving 1 px per ms for `ms`, one sample every 10 ms. */
function steady(ms: number): Sample[] {
  return Array.from({ length: ms / 10 + 1 }, (_, i) => ({
    t: i * 10,
    x: i * 10,
    y: 0,
  }))
}

test('recentOf keeps the last 100 ms, all that speed reads', () => {
  const samples = steady(2000)
  const recent = recentOf(samples)
  expect(recent.map((s) => s.t)).toEqual(steady(100).map((s) => s.t + 1900))
  expect(speed(recent, 'x')).toBeCloseTo(speed(samples, 'x'), 9)
  expect(speed(recent, 'x')).toBeCloseTo(1000, 6)
})

test('recentOf of nothing is nothing', () => {
  expect(recentOf([])).toEqual([])
})

describe('speed: least squares over the last 100 ms', () => {
  test('a steady move: its speed in px/s', () => {
    const samples = [0, 10, 20, 30, 40].map((t) => ({ t, x: t * 2, y: 0 }))
    expect(speed(samples, 'x')).toBeCloseTo(2000)
  })

  test('only the last 100 ms count', () => {
    const slow = [0, 15, 30].map((t) => ({ t, x: t * 0.1, y: 0 }))
    const fast = [100, 110, 120, 130, 140].map((t) => ({
      t,
      x: 3 + (t - 100) * 3,
      y: 0,
    }))
    expect(speed([...slow, ...fast], 'x')).toBeCloseTo(3000)
  })

  test('a pointer still for 40 ms has none', () => {
    expect(
      speed(
        [
          { t: 0, x: 0, y: 0 },
          { t: 10, x: 30, y: 0 },
          { t: 80, x: 30, y: 0 },
        ],
        'x',
      ),
    ).toBe(0)
  })
})
