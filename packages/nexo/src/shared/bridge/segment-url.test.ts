import { describe, expect, test } from 'bun:test'
import { segmentsOf, splitNames, withSegments } from './segment-url'

describe('segmentsOf', () => {
  test('reads the names a URL asks for', () => {
    expect(
      segmentsOf('http://m.test/es/arcade?_segment=shelf,counter'),
    ).toEqual(['shelf', 'counter'])
    expect(segmentsOf(new URL('http://m.test/es/arcade'))).toEqual([])
  })

  test('accepts a path alone', () => {
    expect(segmentsOf('/es/arcade?_segment=shelf')).toEqual(['shelf'])
  })
})

describe('withSegments', () => {
  test('adds the parameter without touching the rest', () => {
    const url = new URL('http://m.test/es/arcade?page=2#top')
    expect(withSegments(url, ['shelf']).href).toBe(
      'http://m.test/es/arcade?page=2&_segment=shelf#top',
    )
    expect(url.href).toBe('http://m.test/es/arcade?page=2#top')
  })

  test('several names keep their commas readable', () => {
    const url = new URL('http://m.test/es/arcade')
    expect(withSegments(url, ['shelf', 'counter']).href).toBe(
      'http://m.test/es/arcade?_segment=shelf,counter',
    )
    expect(segmentsOf(withSegments(url, ['shelf', 'counter']))).toEqual([
      'shelf',
      'counter',
    ])
  })

  test('with no names, removes it', () => {
    const url = new URL('http://m.test/a?_segment=shelf&x=1')
    expect(withSegments(url, []).href).toBe('http://m.test/a?x=1')
  })
})

describe('splitNames', () => {
  test('splits on commas and ignores blanks', () => {
    expect(splitNames(' shelf , counter,,')).toEqual(['shelf', 'counter'])
    expect(splitNames(null)).toEqual([])
    expect(splitNames('')).toEqual([])
  })
})
