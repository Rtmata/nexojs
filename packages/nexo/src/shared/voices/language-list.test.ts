import { describe, expect, test } from 'bun:test'
import { LanguageList } from './language-list'

describe('LanguageList', () => {
  test('finds the language asked or its closest; else the default, saying so', () => {
    const list = new LanguageList(['en', 'es'])
    expect(list.find('es-MX')).toEqual({ lang: 'es', fallback: false })
    expect(list.find('fr')).toEqual({ lang: 'en', fallback: true })
    expect(list.find(undefined)).toEqual({ lang: 'en', fallback: false })
  })

  test('refuses no languages, a non-tag, and the same language twice', () => {
    expect(() => new LanguageList([])).toThrow('give at least one language')
    expect(() => new LanguageList(['!!'])).toThrow('is not a language tag')
    expect(() => new LanguageList(['zh-TW', 'zh-Hant-TW'])).toThrow(
      'the same language more than once',
    )
  })
})
