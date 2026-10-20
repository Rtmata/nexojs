import { describe, expect, test } from 'bun:test'
import { matches } from './etag'

describe('matches', () => {
  test('the tag itself, weak or strong, alone or in a list, or any at all', () => {
    expect(matches('"a"', '"a"')).toBe(true)
    expect(matches('W/"a"', '"a"')).toBe(true)
    expect(matches('"a"', 'W/"a"')).toBe(true)
    expect(matches('"x", "a"', '"a"')).toBe(true)
    expect(matches('*', '"a"')).toBe(true)
  })

  test('not another tag, nor nothing', () => {
    expect(matches('"b"', '"a"')).toBe(false)
    expect(matches(null, '"a"')).toBe(false)
    expect(matches('', '"a"')).toBe(false)
  })
})
