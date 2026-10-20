import { describe, expect, test } from 'bun:test'
import { Validators } from './validators'

// 2026-10-20T12:00:00.500Z: the half second is dropped, Last-Modified is whole seconds.
const file = { size: 0x1f, lastModified: Date.UTC(2026, 9, 20, 12, 0, 0, 500) }
const validators = new Validators(file)
const h = (headers: Record<string, string>) => new Headers(headers)

describe('Validators', () => {
  test('a weak ETag from size and date, and the date to the second', () => {
    expect(validators.etag).toBe(
      `W/"1f-${Math.floor(file.lastModified / 1000).toString(16)}"`,
    )
    expect(validators.lastModified).toBe('Tue, 20 Oct 2026 12:00:00 GMT')
  })

  test('If-None-Match decides, and wins over If-Modified-Since', () => {
    expect(validators.unchanged(h({ 'if-none-match': validators.etag }))).toBe(
      true,
    )
    expect(validators.unchanged(h({ 'if-none-match': '"other"' }))).toBe(false)
    const both = {
      'if-none-match': '"other"',
      'if-modified-since': validators.lastModified,
    }
    expect(validators.unchanged(h(both))).toBe(false)
  })

  test('If-Modified-Since: unchanged at that second or earlier', () => {
    expect(
      validators.unchanged(h({ 'if-modified-since': validators.lastModified })),
    ).toBe(true)
    expect(
      validators.unchanged(
        h({ 'if-modified-since': 'Wed, 21 Oct 2026 12:00:00 GMT' }),
      ),
    ).toBe(true)
    expect(
      validators.unchanged(
        h({ 'if-modified-since': 'Mon, 19 Oct 2026 12:00:00 GMT' }),
      ),
    ).toBe(false)
    expect(validators.unchanged(h({ 'if-modified-since': 'yesterday' }))).toBe(
      false,
    )
    expect(validators.unchanged(h({}))).toBe(false)
  })

  test('If-Range: a range goes on with the same date, never with a weak ETag', () => {
    expect(validators.rangeApplies(h({}))).toBe(true)
    expect(
      validators.rangeApplies(h({ 'if-range': validators.lastModified })),
    ).toBe(true)
    expect(
      validators.rangeApplies(
        h({ 'if-range': 'Mon, 19 Oct 2026 12:00:00 GMT' }),
      ),
    ).toBe(false)
    expect(validators.rangeApplies(h({ 'if-range': validators.etag }))).toBe(
      false,
    )
    expect(validators.rangeApplies(h({ 'if-range': '"strong"' }))).toBe(false)
  })
})
