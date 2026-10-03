import { describe, expect, test } from 'bun:test'
import { voices } from './voices'

describe('voices', () => {
  const t = voices(['en', 'es'], {
    en: {
      consoles: 'Consoles',
      games: (n: number) => (n === 1 ? '1 game' : `${n} games`),
      nav: { home: 'Home' },
    },
    es: {
      consoles: 'Consolas',
      games: (n: number) => (n === 1 ? '1 juego' : `${n} juegos`),
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

describe('pick', () => {
  const t = voices(['en', 'es'])

  test('needs no messages: languages are enough', () => {
    expect(t.languages).toEqual(['en', 'es'])
    expect(t('es')).toEqual({})
  })

  test('takes the asked language when it exists', () => {
    expect(t.pick({ en: 'Fighter', es: 'Lucha' }, 'es')).toEqual({
      value: 'Lucha',
      lang: 'es',
      fallback: false,
    })
  })

  test('falls back to the default language, then to any', () => {
    expect(t.pick({ en: 'Fighter' }, 'es')).toEqual({
      value: 'Fighter',
      lang: 'en',
      fallback: true,
    })
    expect(t.pick({ ja: 'ファイター' }, 'es')).toEqual({
      value: 'ファイター',
      lang: 'ja',
      fallback: true,
    })
  })

  test('is null when there is nothing to pick', () => {
    expect(t.pick({}, 'es')).toBeNull()
  })
})

describe('missing and malformed messages', () => {
  test('null and empty texts count as missing', () => {
    const t = voices(['en', 'es'])
    expect(t.pick({ es: null, en: 'Fighter' }, 'es')).toEqual({
      value: 'Fighter',
      lang: 'en',
      fallback: true,
    })
    expect(t.pick({ es: '', en: 'Fighter' }, 'es')?.lang).toBe('en')
    expect(t.pick({ es: null }, 'es')).toBeNull()
  })

  test('tags compare case-insensitively and a region is close to its language', () => {
    const t = voices(['en', 'es'], { en: { a: 'A' }, es: { a: 'Á' } })
    expect(t('ES' as any).a).toBe('Á')
    expect(t.pick({ EN: 'Fighter', es: 'Lucha' }, 'en')).toEqual({
      value: 'Fighter',
      lang: 'EN',
      fallback: false,
    })
    expect(t.pick({ 'es-MX': 'Lucha', en: 'Fighter' }, 'es')?.value).toBe(
      'Lucha',
    )
  })

  test('inherited keys are not languages', () => {
    const t = voices(['en', 'es'])
    expect(t.for('constructor')).toMatchObject({ lang: 'en', fallback: true })
    expect(t.pick({ en: 'x' }, '__proto__' as any)?.lang).toBe('en')
  })

  test('malformed messages give the promised report, not a crash', () => {
    expect(() => voices(['en', 'es'], { en: {}, es: null } as any)).toThrow(
      '"es" messages must be an object',
    )
    expect(() => voices(['en', 'es'], { en: {} } as any)).toThrow(
      '"es" has no messages',
    )
    expect(() =>
      voices(['en', 'es'], { en: {}, es: 'Consolas' } as any),
    ).toThrow('"es" messages must be an object')
  })

  test('a missing group is reported once, not key by key', () => {
    let message = ''
    try {
      voices(['en', 'es'], {
        en: { game: { a: 'A', b: 'B', c: 'C' } },
        es: {},
      } as any)
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).toContain('"es" is missing "game"')
    expect(message).not.toContain('game.a')
  })

  test('cycles are reported and non-plain objects are single values', () => {
    const loop: any = { a: 'A' }
    loop.self = loop
    expect(() => voices(['en'], { en: loop })).toThrow('points back to a group')
    const t = voices(['en', 'es'], {
      en: { when: new Date(0), tips: ['a', 'b'] },
      es: { when: new Date(0), tips: ['á', 'b'] },
    })
    expect(t('en').tips).toEqual(['a', 'b'])
  })

  test('messages and languages cannot change after the check', () => {
    const languages = ['en', 'es']
    const t = voices(languages, {
      en: { nav: { home: 'Home' } },
      es: { nav: { home: 'Inicio' } },
    })
    expect(() => {
      ;(t('es') as any).nav.home = 'changed'
    }).toThrow()
    languages[0] = 'es'
    expect(t.languages[0]).toBe('en')
  })
})

describe('copies, regions and duplicates', () => {
  test('one group reused in two places is not a cycle', () => {
    const common = { ok: 'OK' }
    expect(() =>
      voices(['en'], { en: { dialog: common, form: common } }),
    ).not.toThrow()
  })

  test('messages are a deep frozen copy; the caller keeps its objects', () => {
    const msgs = { en: Object.freeze({ nav: { home: 'Home' }, tips: ['a'] }) }
    const t = voices(['en'], msgs as any)
    expect(() => ((t('en') as any).nav.home = 'x')).toThrow()
    expect(() => (t('en') as any).tips.push('b')).toThrow()
    ;(msgs as any).en = {}
    expect((t('en') as any).nav.home).toBe('Home')
    expect(Object.isFrozen(msgs)).toBe(false)
  })

  test('an undefined message counts as missing', () => {
    expect(() =>
      voices(['en', 'es'], {
        en: { title: undefined },
        es: { title: 'Museo' },
      } as any),
    ).toThrow('"en" is missing "title"')
  })

  test('pick of no versions at all is null', () => {
    expect(voices(['en']).pick(null as any, 'en')).toBeNull()
  })

  test('t() falls back to the base language; pick prefers it over another region', () => {
    const t = voices(['en', 'es'], { en: { a: 'A' }, es: { a: 'Á' } })
    expect(t('es-MX' as any).a).toBe('Á')
    expect(
      t.pick({ 'es-AR': 'ar', es: 'neutral' }, 'es-MX' as any)?.value,
    ).toBe('neutral')
    expect(t.pick({ es_MX: 'mx', en: 'en' }, 'es')?.value).toBe('mx')
  })

  test('a language listed twice is rejected', () => {
    expect(() => voices(['en', 'EN'])).toThrow(
      'name the same language more than once',
    )
  })
})

describe('fallbacks, kinds and lists', () => {
  const t = voices(['en', 'es'], { en: { a: 'A' }, es: { a: 'Á' } })

  test('an unknown language falls back to the default, and t.for says so', () => {
    expect(t('fr' as any).a).toBe('A')
    expect(t.for('fr')).toEqual({
      messages: { a: 'A' },
      lang: 'en',
      fallback: true,
    })
    expect(t.for('es-MX')).toMatchObject({ lang: 'es', fallback: false })
    expect(t.for(null)).toMatchObject({ lang: 'en', fallback: false })
  })

  test('pick takes any tag, as it comes from a request', () => {
    const header: string | null = 'es'
    expect(t.pick({ es: 'Lucha' }, header)?.value).toBe('Lucha')
  })

  test('numbers and booleans are not text', () => {
    expect(() =>
      voices(['en', 'es'], { en: { n: 5 }, es: { n: 'cinco' } } as any),
    ).toThrow('"n" is a number in en but text in es')
  })

  test('an empty or broken language tag fails at startup', () => {
    expect(() => voices(['', 'en'])).toThrow('"" is not a language tag')
  })

  test('a group reused in many places is copied once', () => {
    const common = { ok: 'OK' }
    const reused = voices(['en'], { en: { a: common, b: common } })
    expect(reused('en').a).toBe(reused('en').b)
  })

  test('a key with a dot never reads as a nested one', () => {
    expect(() =>
      voices(['en', 'es'], {
        en: { 'a.b': 'x' },
        es: { a: { b: 'x' } },
      } as any),
    ).toThrow('"en" is missing "a"')
  })

  test('lists are checked item by item, by position', () => {
    expect(() =>
      voices(['en', 'es'], {
        en: { menu: [{ label: 'Home' }], tips: ['a', 'b'] },
        es: { menu: [{}], tips: ['a'] },
      } as any),
    ).toThrow('"es" is missing "menu.0.label"\n  "es" is missing "tips.1"')
  })
})

describe('tags, getters and paths', () => {
  test("a tag written with '_' is a tag", () => {
    expect(voices(['es_MX', 'en']).languages).toEqual(['es_MX', 'en'])
  })

  test('Simplified Chinese never gets Traditional, even with the script implied', () => {
    const t = voices(['en', 'zh-Hant'])
    expect(t.for('zh-CN')).toMatchObject({ lang: 'en', fallback: true })
    expect(t.pick({ 'zh-Hant': '繁體', en: 'x' }, 'zh-CN')?.lang).toBe('en')
  })

  test('a getter is refused: a message is a value or a function', () => {
    const messages = {
      en: {
        get now() {
          return Date.now()
        },
      },
    }
    expect(() => voices(['en'], messages)).toThrow('"en.now" is a getter')
  })

  test('a key with a dot is shown quoted', () => {
    expect(() =>
      voices(['en', 'es'], { en: { 'a.b': 'x' }, es: {} } as any),
    ).toThrow('"es" is missing "["a.b"]"')
  })

  test('pick takes no versions at all, as a nullable column gives', () => {
    const column: { en: string } | null = null
    expect(voices(['en']).pick(column, 'en')).toBeNull()
  })
})
