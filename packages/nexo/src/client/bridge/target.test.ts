import { describe, expect, test } from 'bun:test'
import { targetOf } from './target'

describe('targetOf', () => {
  test('without the attribute, the enclosing segment; none outside', () => {
    expect(targetOf(null, 'shelf')).toEqual({
      kind: 'segments',
      names: ['shelf'],
    })
    expect(targetOf(null, null)).toEqual({ kind: 'none' })
  })

  test('names, one or many', () => {
    expect(targetOf('counter', 'shelf')).toEqual({
      kind: 'segments',
      names: ['counter'],
    })
    expect(targetOf('shelf, counter', null).kind).toBe('segments')
  })

  test('_top and _none, also with spaces around', () => {
    expect(targetOf(' _top ', 'shelf')).toEqual({ kind: 'top' })
    expect(targetOf('_none', 'shelf')).toEqual({ kind: 'none' })
  })

  test('an empty attribute means none', () => {
    expect(targetOf('', 'shelf')).toEqual({ kind: 'none' })
    expect(targetOf(' , ', 'shelf')).toEqual({ kind: 'none' })
  })
})
