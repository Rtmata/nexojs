import { describe, expect, test } from 'bun:test'
import { checkPair, contrastRatio } from './contrast'
import { readableOn } from './readable-on'

describe('contrastRatio: WCAG 2.2 reference values', () => {
  test.each([
    ['#000', '#fff', 21],
    ['#fff', '#fff', 1],
    ['#777', '#fff', 4.48], // the classic near miss of 1.4.3
    ['#767676', '#fff', 4.54], // the lightest grey that passes on white
    ['#595959', '#fff', 7.0], // AAA, 1.4.6
    ['#f00', '#fff', 4.0],
    ['#00f', '#fff', 8.59],
  ])('%s on %s is %d:1', (a, b, ratio) => {
    expect(contrastRatio(a, b)).toBeCloseTo(ratio, 2)
  })

  test('the order does not matter', () => {
    expect(contrastRatio('#fff', '#777')).toBe(contrastRatio('#777', '#fff'))
  })

  test('a translucent colour throws: what shows through changes it', () => {
    expect(() => contrastRatio('rgb(0 0 0 / 50%)', '#fff')).toThrow(
      'glyph: "rgb(0 0 0 / 50%)" is translucent; contrast needs opaque colours, since what shows through changes it',
    )
  })
})

describe('checkPair: text needs 4.5:1, ui 3:1', () => {
  test('#777 on white fails text and passes ui; WCAG does not round up', () => {
    expect(checkPair('#777', '#fff', 'text')).toEqual({
      ratio: contrastRatio('#777', '#fff'),
      required: 4.5,
      passes: false,
    })
    expect(checkPair('#777', '#fff', 'ui').passes).toBe(true)
  })

  test('#767676 on white passes text', () => {
    expect(checkPair('#767676', '#fff', 'text').passes).toBe(true)
  })
})

describe('readableOn', () => {
  test('the candidate with the best contrast, any colours', () => {
    expect(readableOn('#3b82f6', ['#fff', '#0f172a'])).toBe('#0f172a')
    expect(readableOn('#1e3a8a', ['#0f172a', 'ivory'])).toBe('ivory')
  })

  test('returned as written, the first on a tie', () => {
    expect(readableOn('#808080', ['WHITE', '#fff'])).toBe('WHITE')
  })

  test('no candidates throws', () => {
    expect(() => readableOn('#fff', [])).toThrow(
      'glyph: readableOn needs at least one candidate colour',
    )
  })
})
