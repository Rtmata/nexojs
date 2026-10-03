import { describe, expect, test } from 'bun:test'
import { ShapeCheck } from './shape-check'

const check = (messages: unknown) => () =>
  ShapeCheck.ensure(['en', 'es'], messages)

describe('ShapeCheck', () => {
  test('passes when every language says the same things', () => {
    expect(
      check({
        en: { a: 'A', n: (x: number) => x },
        es: { a: 'Á', n: (x: number) => x },
      }),
    ).not.toThrow()
  })

  test('lists every missing message, and a missing group once', () => {
    expect(check({ en: { g: { a: 'A', b: 'B' }, t: 'T' }, es: {} })).toThrow(
      '"es" is missing "g"\n  "es" is missing "t"',
    )
  })

  test('kinds must match: text, numbers, functions, lists and groups', () => {
    expect(check({ en: { n: 5 }, es: { n: 'cinco' } })).toThrow(
      '"n" is a number in en but text in es',
    )
  })

  test('lists are compared item by item', () => {
    expect(check({ en: { tips: ['a', 'b'] }, es: { tips: ['a'] } })).toThrow(
      '"es" is missing "tips.1"',
    )
  })
})
