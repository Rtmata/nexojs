import { expect, test } from 'bun:test'
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
