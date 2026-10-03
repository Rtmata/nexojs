import { describe, expect, test } from 'bun:test'
import { decodedSegments, decodeSegment, splitSegments } from './decode'

describe('decoding a segment', () => {
  test('decodes every valid escape, keeping malformed ones as written', () => {
    expect(decodeSegment('caf%C3%A9')).toBe('café')
    expect(decodeSegment('a%C3%B1o-50%')).toBe('año-50%')
    expect(decodeSegment('%E0x')).toBe('%E0x')
  })
})

describe('decoding a path', () => {
  test('splits into segments; root and a trailing slash add none', () => {
    expect(decodedSegments('/')).toEqual([])
    expect(decodedSegments('/consola/nes/')).toEqual(['consola', 'nes'])
  })

  test('a segment that decodes to a separator makes the path unusable', () => {
    expect(decodedSegments('/old/a%2F..%2Fetc')).toBeNull()
    expect(decodedSegments('/files/a%5Cb')).toBeNull()
  })
})

describe('escapes next to a broken one', () => {
  test('each valid character is decoded; only the broken escape stays', () => {
    expect(decodeSegment('caf%C3%A9%C3')).toBe('café%C3')
    expect(decodeSegment('%41%E0')).toBe('A%E0')
  })

  test('a path without its leading slash keeps its first segment', () => {
    expect(splitSegments('consola/nes')).toEqual(['consola', 'nes'])
  })
})
