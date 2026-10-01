import { describe, expect, test } from 'bun:test'
import { quarry } from '../quarry'
import { voices } from './voices'

describe('voices', () => {
  const t = voices(['en', 'es'], {
    en: {
      consoles: 'Consoles',
      games: (n: number) =>
        quarry('en').plural(n, { one: '# game', other: '# games' }),
      nav: { home: 'Home' },
    },
    es: {
      consoles: 'Consolas',
      games: (n: number) =>
        quarry('es').plural(n, { one: '# juego', other: '# juegos' }),
      nav: { home: 'Inicio' },
    },
  })

  test('hands out the messages of a language', () => {
    expect(t('es').consoles).toBe('Consolas')
    expect(t('es').games(12)).toBe('12 juegos')
    expect(t('en').nav.home).toBe('Home')
  })

  test('the first language is the default', () => {
    expect(t().consoles).toBe('Consoles')
  })

  test('lists every missing message at startup', () => {
    expect(() =>
      voices(['en', 'es'], {
        en: { title: 'Museum', nav: { home: 'Home', about: 'About' } },
        es: { nav: { home: 'Inicio' } },
      } as any),
    ).toThrow('"es" is missing "nav.about"\n  "es" is missing "title"')
  })

  test('catches a message that is text in one language and a function in another', () => {
    expect(() =>
      voices(['en', 'es'], {
        en: { games: (n: number) => `${n} games` },
        es: { games: 'juegos' },
      } as any),
    ).toThrow('"games" is a function in en but text in es')
  })

  test('catches missing and unknown languages', () => {
    expect(() => voices(['en', 'es'], { en: {} } as any)).toThrow(
      '"es" has no messages',
    )
    expect(() => voices(['en'], { en: {}, pt: {} } as any)).toThrow(
      '"pt" is not one of the languages',
    )
  })

  test('the editor refuses a message missing from any language', () => {
    // Types only: never called, since voices would (rightly) throw.
    const typeCheck = () => {
      const partial = voices(['en', 'es'], {
        en: { a: 'A', b: 'B' },
        es: { a: 'A' },
      } as const)
      // @ts-expect-error: `b` doesn't exist in every language
      return partial('en').b
    }
    expect(typeCheck).toBeFunction()
  })
})
