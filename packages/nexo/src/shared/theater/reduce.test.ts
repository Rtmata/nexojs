import { expect, test } from 'bun:test'
import { movesThings } from './reduce'

test('what changes size, shape or position is motion (WCAG 2.3.3)', () => {
  for (const property of [
    'translate',
    'transform',
    'width',
    'marginTop',
    'padding-inline-start',
    'borderRadius',
    'backgroundPosition',
  ]) {
    expect(movesThings(property, [])).toBe(true)
  }
})

test('color and opacity are not motion', () => {
  for (const property of ['opacity', 'color', 'backgroundColor', '--glow']) {
    expect(movesThings(property, [])).toBe(false)
  }
})

test('a filter is motion only when it blurs (the errata)', () => {
  expect(movesThings('filter', ['blur(0)', 'blur(4px)'])).toBe(true)
  expect(movesThings('filter', ['grayscale(0)', 'grayscale(1)'])).toBe(false)
})
