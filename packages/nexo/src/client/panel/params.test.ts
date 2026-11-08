import { describe, expect, test } from 'bun:test'
import { attributeOf, boolean, json, number, oneOf, string } from './params'

describe('param parsers (D.3)', () => {
  test('missing → the fallback', () => {
    expect(number(3).parse(null, 'g.start')).toBe(3)
    expect(boolean().parse(null, 'g.loop')).toBe(false)
    expect(string('x').parse(null, 'g.s')).toBe('x')
    expect(json<string[]>([]).parse(null, 'g.shots')).toEqual([])
    expect(oneOf(['a', 'b'], 'a').parse(null, 'g.side')).toBe('a')
  })

  test('present → parsed; a boolean is its presence', () => {
    expect(number(0).parse('2.5', 'g.start')).toBe(2.5)
    expect(boolean().parse('', 'g.loop')).toBe(true)
    expect(json<number[]>([]).parse('[1,2]', 'g.shots')).toEqual([1, 2])
    expect(oneOf(['a', 'b'], 'a').parse('b', 'g.side')).toBe('b')
  })

  test('invalid → an error naming the key', () => {
    expect(() => number(0).parse('two', 'gallery.start')).toThrow(
      'gallery.start: expected a number, got "two"',
    )
    expect(() => number(0).parse('', 'gallery.start')).toThrow(
      'expected a number',
    )
    expect(() => json([]).parse('[1,', 'gallery.shots')).toThrow(
      'gallery.shots: expected JSON',
    )
    expect(() => oneOf(['a', 'b'], 'a').parse('c', 'gallery.side')).toThrow(
      'expected one of a, b',
    )
  })

  test('attribute names as dataset writes them', () => {
    expect(attributeOf('gallery', 'start')).toBe('data-gallery-start')
    expect(attributeOf('photo-strip', 'autoPlay')).toBe(
      'data-photo-strip-auto-play',
    )
  })
})

describe('boolean round trip (a fallback of true)', () => {
  test('"false" is the one text that turns it off; write() omits the fallback', () => {
    expect(boolean(true).parse(null, 'g.open')).toBe(true)
    expect(boolean(true).parse('false', 'g.open')).toBe(false)
    expect(boolean(true).parse('', 'g.open')).toBe(true)
    expect(boolean(true).write(false)).toBe('false')
    expect(boolean(true).write(true)).toBe(null)
    expect(boolean().write(true)).toBe(true)
    expect(boolean().write(false)).toBe(null)
  })
})
