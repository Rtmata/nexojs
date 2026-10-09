import { describe, expect, test } from 'bun:test'
import { isPlainNavigation, type Click } from './click'

const plain: Click = {
  button: 0,
  modified: false,
  defaultPrevented: false,
  href: 'http://museo.test/es/arcade',
  pageOrigin: 'http://museo.test',
  download: false,
  opensElsewhere: false,
}

describe('isPlainNavigation', () => {
  test('a left click on a same-origin link', () => {
    expect(isPlainNavigation(plain)).toBe(true)
  })

  test('not with a modifier, another button or when already handled', () => {
    expect(isPlainNavigation({ ...plain, modified: true })).toBe(false)
    expect(isPlainNavigation({ ...plain, button: 1 })).toBe(false)
    expect(isPlainNavigation({ ...plain, defaultPrevented: true })).toBe(false)
  })

  test('not to another site, a download or a link that opens elsewhere', () => {
    expect(isPlainNavigation({ ...plain, href: 'https://igdb.com/x' })).toBe(
      false,
    )
    expect(isPlainNavigation({ ...plain, download: true })).toBe(false)
    expect(isPlainNavigation({ ...plain, opensElsewhere: true })).toBe(false)
    expect(isPlainNavigation({ ...plain, href: 'mailto:x@y.z' })).toBe(false)
  })
})
