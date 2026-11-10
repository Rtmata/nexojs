import { expect, test } from 'bun:test'
import { curveOf, delayOf, durationOf, iterationsOf } from './options'

test('a NaN or negative duration or iterations throws a TypeError, as WAAPI does', () => {
  for (const duration of [NaN, -1]) {
    expect(() => durationOf({ duration })).toThrow(TypeError)
    expect(() => curveOf({ duration }, 1)).toThrow(TypeError)
  }
  for (const iterations of [NaN, -1]) {
    expect(() => iterationsOf({ iterations })).toThrow(TypeError)
  }
  expect(iterationsOf({ iterations: Infinity })).toBe(Infinity)
  expect(durationOf({})).toBe(300)
})

test('a delay must be finite; a negative one is fine (it starts partway)', () => {
  expect(() => delayOf({ delay: NaN })).toThrow(TypeError)
  expect(() => delayOf({ delay: Infinity })).toThrow(TypeError)
  expect(() => delayOf({ delay: () => NaN })).toThrow(TypeError)
  expect(delayOf({ delay: -100 })).toBe(-100)
})
