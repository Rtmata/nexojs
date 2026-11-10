import { describe, expect, test } from 'bun:test'
import {
  positionOf,
  rangePoint,
  scrollProgress,
  viewProgress,
  type ViewGeometry,
} from './scroll-range'

/** A 200 px subject 1500 px down, in an 800 px viewport. */
const view: ViewGeometry = {
  subjectStart: 1500,
  subjectSize: 200,
  viewport: 800,
}

describe('ranges of a view timeline', () => {
  test('cover: from the first pixel entering to the last leaving', () => {
    expect(positionOf(rangePoint('cover 0%'), view)).toBe(700)
    expect(positionOf(rangePoint('cover 100%'), view)).toBe(1700)
  })

  test('contain: while fully inside; entry and exit: the edges', () => {
    expect(positionOf(rangePoint('contain 0%'), view)).toBe(900)
    expect(positionOf(rangePoint('contain 100%'), view)).toBe(1500)
    expect(positionOf(rangePoint('entry 100%'), view)).toBe(900)
    expect(positionOf(rangePoint('exit 0%'), view)).toBe(1500)
  })

  test('a subject bigger than the viewport: contain is while it covers it', () => {
    const tall = { subjectStart: 1000, subjectSize: 2000, viewport: 800 }
    expect(positionOf(rangePoint('contain 0%'), tall)).toBe(1000)
    expect(positionOf(rangePoint('contain 100%'), tall)).toBe(2200)
  })

  test('a bare percentage is of cover', () => {
    expect(rangePoint('50%')).toEqual({ name: 'cover', fraction: 0.5 })
  })

  test('progress is clamped between the two points', () => {
    const [from, to] = [rangePoint('cover 0%'), rangePoint('cover 100%')]
    expect(viewProgress(1200, view, from, to)).toBe(0.5)
    expect(viewProgress(0, view, from, to)).toBe(0)
    expect(viewProgress(5000, view, from, to)).toBe(1)
  })

  test('a point without a percentage says what one looks like', () => {
    expect(() => rangePoint('entry')).toThrow('like "entry 0%"')
  })
})

test('scrollProgress: how far the scroller is scrolled', () => {
  expect(scrollProgress(1100, 3000, 800)).toBe(0.5)
  expect(scrollProgress(0, 500, 800)).toBe(1) // nothing to scroll
})
