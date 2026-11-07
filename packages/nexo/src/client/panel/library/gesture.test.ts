import { describe, expect, test } from 'bun:test'
import { speed } from './gesture'

describe('gesture velocity (least squares over 100 ms)', () => {
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
