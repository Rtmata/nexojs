import { describe, expect, test } from 'bun:test'
import { freshnessOf } from './freshness'

describe('freshnessOf', () => {
  test('without headers, the default', () => {
    expect(freshnessOf(200, null, 60_000)).toBe(60_000)
    expect(freshnessOf(200, '', 60_000)).toBe(60_000)
  })

  test('max-age sets the time; no-cache means stale at once', () => {
    expect(freshnessOf(200, 'max-age=300', 60_000)).toBe(300_000)
    expect(freshnessOf(200, 'public, Max-Age=5', 60_000)).toBe(5_000)
    expect(freshnessOf(200, 'no-cache', 60_000)).toBe(0)
    expect(freshnessOf(200, 'max-age=later', 60_000)).toBe(60_000)
  })

  test('no-store and errors are never kept', () => {
    expect(freshnessOf(200, 'no-store', 60_000)).toBeNull()
    expect(freshnessOf(200, 'max-age=60, no-store', 60_000)).toBeNull()
    expect(freshnessOf(404, null, 60_000)).toBeNull()
    expect(freshnessOf(500, 'max-age=60', 60_000)).toBeNull()
  })
})
