import { describe, expect, test } from 'bun:test'
import { VersionPicker } from './version-picker'

const picker = new VersionPicker(['en', 'es'])

describe('VersionPicker', () => {
  test('the language asked, else the declared order, else any', () => {
    expect(picker.pick({ es: 'Lucha', en: 'Fighter' }, 'es')?.value).toBe(
      'Lucha',
    )
    expect(picker.pick({ en: 'Fighter' }, 'es')).toEqual({
      value: 'Fighter',
      lang: 'en',
      fallback: true,
    })
    expect(picker.pick({ fr: 'Combat' }, 'es')?.lang).toBe('fr')
  })

  test('only language keys count: a whole row never answers with its id', () => {
    expect(
      picker.pick(
        { 5: 'x', id: null, en: null } as Record<string, unknown>,
        'es',
      ),
    ).toBeNull()
  })

  test('a typed row (an interface) is accepted as it is', () => {
    interface TitleRow {
      en: string
      es: string | null
    }
    const row: TitleRow = { en: 'Fighter', es: null }
    expect(picker.pick(row, 'es')?.value).toBe('Fighter')
  })
})
