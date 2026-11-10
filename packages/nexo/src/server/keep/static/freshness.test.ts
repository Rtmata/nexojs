import { describe, expect, test } from 'bun:test'
import { cacheControlOf, ensureCacheOption } from './freshness'

describe('cacheControlOf', () => {
  test('ask every time unless told how long to keep', () => {
    expect(cacheControlOf(undefined)).toBe('no-cache')
    expect(cacheControlOf('immutable')).toBe(
      'public, max-age=31536000, immutable',
    )
    expect(cacheControlOf(60 * 60 * 1000)).toBe('public, max-age=3600') // ms in, seconds out
    expect(cacheControlOf(false)).toBeNull()
  })
})

describe('ensureCacheOption', () => {
  test('the forms it takes', () => {
    expect(ensureCacheOption(undefined)).toBeUndefined()
    expect(ensureCacheOption('immutable')).toBe('immutable')
    expect(ensureCacheOption(0)).toBe(0)
    expect(ensureCacheOption(false)).toBe(false)
  })

  test('anything else is a setup mistake', () => {
    for (const bad of ['forever', -1, 1.5, true, null])
      expect(() => ensureCacheOption(bad)).toThrow(
        `keep: cache takes 'immutable', a number of seconds or false, not ${JSON.stringify(bad)}`,
      )
  })
})
