import { describe, expect, test } from 'bun:test'
import {
  baseOf,
  canonicalTag,
  findTag,
  matchTag,
  sameMeaning,
  sameTag,
} from './tag'

describe('comparing tags', () => {
  test('ignores case and reads _ as -', () => {
    expect(sameTag('es_MX', 'ES-mx')).toBe(true)
    expect(canonicalTag('ES_mx')).toBe('es-MX')
    expect(canonicalTag('x-pirate!')).toBeNull()
  })

  test('the base language comes from the parsed tag', () => {
    expect(baseOf('nb-NO')).toBe('nb')
    expect(baseOf('th-u-nu-thai')).toBe('th')
  })

  test('findTag only takes the very same tag', () => {
    expect(findTag(['es', 'en'], 'ES')).toBe('es')
    expect(findTag(['es', 'en'], 'es-tienda')).toBeUndefined()
  })
})

describe('matching a tag', () => {
  test('a region is close to its language, the bare language first', () => {
    expect(matchTag(['en', 'es'], 'es-MX')).toBe('es')
    expect(matchTag(['es-AR', 'es'], 'es-MX')).toBe('es')
    expect(matchTag(['es-AR', 'en'], 'es-MX')).toBe('es-AR')
  })

  test('never across scripts, also implied ones', () => {
    expect(matchTag(['zh-Hans', 'zh-Hant'], 'zh-TW')).toBe('zh-Hant')
    expect(matchTag(['zh', 'zh-Hant'], 'zh-Hant-TW')).toBe('zh-Hant')
    expect(matchTag(['zh-Hant'], 'zh-CN')).toBeUndefined()
  })

  test('extensions are not scripts, and private-use tags match only exactly', () => {
    expect(matchTag(['th'], 'th-u-nu-thai')).toBe('th')
    expect(matchTag(['x-a'], 'x-b')).toBeUndefined()
    expect(matchTag(['x-a'], 'X-A')).toBe('x-a')
  })
})

describe('regions and implied meaning', () => {
  test('the same region wins among close candidates', () => {
    expect(matchTag(['zh-HK', 'zh-TW'], 'zh-Hant-TW')).toBe('zh-TW')
    expect(matchTag(['es-ES', 'es-MX'], 'es-MX-u-nu-latn')).toBe('es-MX')
  })

  test('tags that imply the same language, script and region mean the same', () => {
    expect(sameMeaning('zh-TW', 'zh-Hant-TW')).toBe(true)
    expect(sameMeaning('zh-TW', 'zh-HK')).toBe(false)
  })
})
