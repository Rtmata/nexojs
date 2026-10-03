import { describe, expect, test } from 'bun:test'
import { FrozenCopy } from './frozen-copy'

describe('FrozenCopy', () => {
  test('copies groups and lists, frozen all the way down', () => {
    const source = { nav: { home: 'Home' }, tips: ['a'] }
    const copy = FrozenCopy.of(source) as typeof source
    expect(copy).toEqual(source)
    expect(copy.nav).not.toBe(source.nav)
    expect(Object.isFrozen(copy.nav) && Object.isFrozen(copy.tips)).toBe(true)
  })

  test('a list keeps its holes in place', () => {
    // eslint-disable-next-line no-sparse-arrays
    const copy = FrozenCopy.of(['a', , 'c']) as unknown[]
    expect(copy).toHaveLength(3)
    expect(copy[1]).toBeUndefined()
    expect(copy[2]).toBe('c')
  })

  test('a group reused in many places is copied once', () => {
    const common = { ok: 'OK' }
    const copy = FrozenCopy.of({ a: common, b: common }) as Record<
      string,
      unknown
    >
    expect(copy.a).toBe(copy.b)
  })

  test('every getter is reported at once, and a cycle is refused', () => {
    const getters = {
      get a() {
        return 'x'
      },
      nested: {
        get b() {
          return 'y'
        },
      },
    }
    expect(() => FrozenCopy.of(getters)).toThrow('"a", "nested.b" are getters')
    const loop: Record<string, unknown> = {}
    loop.self = loop
    expect(() => FrozenCopy.of(loop)).toThrow('points back to a group')
  })
})
