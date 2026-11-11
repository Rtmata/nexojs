import { describe, expect, test } from 'bun:test'
import { closest } from './closest'

const names = ['primary', 'surface', 'text', 'on-primary']

describe('closest: "did you mean" (C.4), as rustc finds one', () => {
  test('a letter missing, extra or changed', () => {
    expect(closest('primry', names)).toBe('primary')
    expect(closest('surfacee', names)).toBe('surface')
    expect(closest('txt', names)).toBe('text')
  })

  test('two neighbours swapped are one edit', () => {
    expect(closest('pirmary', names)).toBe('primary')
    expect(closest('tetx', names)).toBe('text')
  })

  test('case is ignored', () => {
    expect(closest('Primary', names)).toBe('primary')
    expect(closest('ON-PRIMARY', names)).toBe('on-primary')
  })

  test('one edit for every three letters, rounded up', () => {
    expect(closest('srfce', names)).toBe('surface') // 5 letters: 2 edits
    expect(closest('zzz', names)).toBeUndefined()
    expect(closest('bg', names)).toBeUndefined()
  })

  test('the nearest wins', () => {
    expect(closest('on-primry', names)).toBe('on-primary')
  })
})
