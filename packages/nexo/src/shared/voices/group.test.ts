import { describe, expect, test } from 'bun:test'
import { isContainer, isGroup, shown } from './group'

describe('groups and paths', () => {
  test('only plain objects are groups; lists hold messages too', () => {
    expect(isGroup({})).toBe(true)
    expect(isGroup(new Date())).toBe(false)
    expect(isContainer(['a'])).toBe(true)
  })

  test('a path is shown with dots, a key with a dot quoted', () => {
    expect(shown(['nav', 'home'])).toBe('nav.home')
    expect(shown(['nav', 'a.b'])).toBe('nav["a.b"]')
  })
})
