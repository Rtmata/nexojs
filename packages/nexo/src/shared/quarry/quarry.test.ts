import { describe, expect, test } from 'bun:test'
import { quarry } from './quarry'

const es = quarry('es')
const en = quarry('en')

describe('number', () => {
  test('follows each language', () => {
    expect(en.number(1234567.5)).toBe('1,234,567.5')
    expect(es.number(1234567.5)).toBe('1.234.567,5')
  })

  test('passes Intl options through', () => {
    expect(en.number(0.256, { style: 'percent' })).toBe('26%')
  })
})

describe('plural', () => {
  const games = { one: '# game', other: '# games' }
  const juegos = { one: '# juego', other: '# juegos' }

  test('picks the form and writes the formatted count', () => {
    expect(en.plural(1, games)).toBe('1 game')
    expect(en.plural(1500, games)).toBe('1,500 games')
    expect(es.plural(1, juegos)).toBe('1 juego')
    expect(es.plural(0, juegos)).toBe('0 juegos')
  })

  test('falls back to other when a form is missing', () => {
    expect(en.plural(1, { other: '# items' })).toBe('1 items')
  })
})

describe('list', () => {
  test('joins with the language conjunction', () => {
    expect(en.list(['Capcom', 'Sega', 'Taito'])).toBe('Capcom, Sega, and Taito')
    expect(es.list(['Capcom', 'Sega', 'Taito'])).toBe('Capcom, Sega y Taito')
  })

  test('can say "or"', () => {
    expect(es.list(['NES', 'SNES'], { type: 'disjunction' })).toBe('NES o SNES')
  })
})

describe('capitalize', () => {
  test('uppercases the first letter only', () => {
    expect(es.capitalize('década de 1980')).toBe('Década de 1980')
    expect(en.capitalize('')).toBe('')
  })

  test('uses the language rules', () => {
    expect(quarry('tr').capitalize('istanbul')).toBe('İstanbul')
    expect(en.capitalize('istanbul')).toBe('Istanbul')
  })
})

describe('partialDate', () => {
  test('shows only what the date knows', () => {
    expect(en.partialDate('1991-05-22')).toBe('May 22, 1991')
    expect(es.partialDate('1991-05-22')).toBe('22 de mayo de 1991')
    expect(en.partialDate('1991-05')).toBe('May 1991')
    expect(es.partialDate('1991-05')).toBe('mayo de 1991')
    expect(es.partialDate('1991')).toBe('1991')
  })

  test('names decades and centuries', () => {
    expect(en.partialDate('198')).toBe('1980s')
    expect(es.partialDate('198')).toBe('década de 1980')
    expect(en.partialDate('19')).toBe('20th century')
    expect(es.partialDate('19')).toBe('siglo XX')
  })

  test('languages without words of their own fall back to English', () => {
    expect(quarry('ja').partialDate('198')).toBe('1980s')
    expect(quarry('es-MX').partialDate('198')).toBe('década de 1980')
  })

  test('is empty for no date and strict about the format', () => {
    expect(en.partialDate(null)).toBe('')
    expect(() => en.partialDate('May 1991')).toThrow('not a partial ISO date')
  })
})

describe('ordinal', () => {
  test('follows each language, with gender where it matters', () => {
    expect(
      [1, 2, 3, 4, 11, 12, 13, 21, 22, 23].map((n) => en.ordinal(n)),
    ).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '23rd',
    ])
    expect(es.ordinal(3)).toBe('3.º')
    expect(es.ordinal(5, { gender: 'feminine' })).toBe('5.ª')
    expect(quarry('fr').ordinal(1, { gender: 'feminine' })).toBe('1re')
    expect(quarry('de').ordinal(3)).toBe('3.')
  })
})

describe('roman', () => {
  test('writes whole numbers from 1 to 3999', () => {
    expect(en.roman(1991)).toBe('MCMXCI')
    expect(en.roman(20)).toBe('XX')
    expect(en.roman(3999)).toBe('MMMCMXCIX')
    expect(() => en.roman(0)).toThrow('from 1 to 3999')
    expect(() => en.roman(2.5)).toThrow('from 1 to 3999')
  })
})

describe('years', () => {
  test('decade, long and short', () => {
    expect(en.decade(1985)).toBe('1980s')
    expect(en.decade('198', { short: true })).toBe("the '80s")
    expect(es.decade('1985', { short: true })).toBe('los 80')
    expect(es.decade(2004, { short: true })).toBe('los 2000')
  })

  test('century, with roman numerals in Spanish', () => {
    expect(en.century(1985)).toBe('20th century')
    expect(es.century('1985')).toBe('siglo XX')
    expect(es.century(2026)).toBe('siglo XXI')
    expect(es.century('19')).toBe('siglo XX')
  })

  test('year ranges as the language writes them', () => {
    expect(en.yearRange(1985, 1990)).toMatch(/^1985\s?–\s?1990$/)
    expect(es.yearRange('1985', '1990')).toMatch(/^1985\s?–\s?1990$/)
  })

  test('how long ago, counting whole years', () => {
    const now = new Date(Date.UTC(2026, 9, 1))
    expect(en.ago('1991', now)).toBe('35 years ago')
    expect(es.ago(1991, now)).toBe('hace 35 años')
    expect(en.ago('1991-12-25', now)).toBe('34 years ago')
    expect(en.ago(2026, now)).toBe('this year')
    expect(() => en.ago('198', now)).toThrow('too vague')
  })
})

describe('slug', () => {
  test('makes URL text with the language\'s own "and"', () => {
    expect(en.slug('Street Fighter II: The World Warrior')).toBe(
      'street-fighter-ii-the-world-warrior',
    )
    expect(en.slug('Tom & Jerry')).toBe('tom-and-jerry')
    expect(es.slug('Tom & Jerry')).toBe('tom-y-jerry')
    expect(en.slug('Pokémon Ruby & Sapphire')).toBe('pokemon-ruby-and-sapphire')
  })

  test("follows each language's spelling of special letters", () => {
    expect(quarry('de').slug('Über Größe')).toBe('ueber-groesse')
    expect(quarry('sv').slug('Smörgåsbord')).toBe('smoergaasbord')
    expect(en.slug('Über Größe')).toBe('uber-grosse')
  })

  test("drops what can't be spelled and trims the edges", () => {
    expect(en.slug('...Iridion 3D!')).toBe('iridion-3d')
    expect(en.slug('ポケモン')).toBe('')
  })
})

describe('fallbacks and early years', () => {
  test('the English fallback uses English ordinal rules', () => {
    expect(quarry('ja').ordinal(1)).toBe('1st')
    expect(quarry('nl').ordinal(2)).toBe('2nd')
    expect(quarry('ru').century(2026)).toBe('21st century')
  })

  test('Turkish slugs keep their I', () => {
    expect(quarry('tr').slug('Istanbul İzmir')).toBe('istanbul-izmir')
    expect(quarry('tr').slug('Kırşehir')).toBe('kirsehir')
  })

  test('years 0–99 stay in their century', () => {
    expect(en.yearRange(50, 99)).toMatch(/^50\s?–\s?99$/)
    expect(en.ago(85, new Date(Date.UTC(2026, 0, 1)))).toBe('1,941 years ago')
  })
})

describe('composed letters, partial ranges and types', () => {
  test('slug gives the same result for composed and decomposed letters', () => {
    const de = quarry('de')
    expect(de.slug('Gru\u0308n')).toBe(de.slug('Grün'))
    expect(de.slug('Grün')).toBe('gruen')
  })

  test('yearRange refuses partial years instead of inventing them', () => {
    expect(() => en.yearRange('198', 1990)).toThrow(
      'too vague for a year range',
    )
  })

  test('the public types are importable from the module', async () => {
    const types: import('./index').Year = 1991
    const options: import('./index').OrdinalOptions = { gender: 'feminine' }
    expect(es.ordinal(types % 10, options)).toBe('1.ª')
  })
})

describe('impossible dates, tags and capitals', () => {
  test('impossible months and days fail instead of rolling over', () => {
    expect(() => en.partialDate('1991-05-00')).toThrow('has no day 0')
    expect(() => en.partialDate('1991-13')).toThrow('has no month 13')
    expect(() => en.partialDate('1991-02-30')).toThrow('has no day 30')
    expect(() => en.partialDate('1991-00')).toThrow('has no month 0')
    expect(en.partialDate('1992-02-29')).toBe('February 29, 1992')
  })

  test('ago counts whole years when the month is known, past and future', () => {
    const now = new Date(Date.UTC(2026, 9, 1))
    expect(en.ago('2025-12-25', now)).toBe('0 years ago')
    expect(en.ago('2024-12-25', now)).toBe('1 year ago')
    expect(en.ago('2028-03', now)).toBe('in 1 year')
    expect(en.ago(2025, now)).toBe('last year')
  })

  test('language tags are read like Intl reads them', () => {
    expect(quarry('ES').century(1985)).toBe('siglo XX')
    expect(quarry('ES-mx').ordinal(3)).toBe('3.º')
    expect(quarry('nb').slug('Blåbærsyltetøy')).toBe('blaabaersyltetoey')
  })

  test('a bare year uses the same calendar as full dates', () => {
    // Asked for, the Buddhist era: 1991 is 2534, with or without a month.
    const buddhist = { calendar: 'buddhist' }
    expect(quarry('th').partialDate('1991', buddhist)).toContain('2534')
    expect(quarry('th').partialDate('1991-05', buddhist)).toContain('2534')
  })

  test('decade refuses a century-only date', () => {
    expect(() => en.decade('19')).toThrow('too vague for a decade')
  })

  test('capitalize finds the first letter past opening marks', () => {
    expect(es.capitalize('¿dónde está?')).toBe('¿Dónde está?')
    expect(es.capitalize('«hola»')).toBe('«Hola»')
    expect(en.capitalize('123')).toBe('123')
  })

  test('the capital sharp s is spelled out', () => {
    expect(quarry('de').slug('GROẞE')).toBe('grosse')
  })

  test('a backwards year range fails', () => {
    expect(() => en.yearRange(1990, 1985)).toThrow('goes backwards')
  })
})

describe('the edges of each method', () => {
  test('capitalize leaves text that starts with a number', () => {
    expect(es.capitalize(es.partialDate('1991-05-22'))).toBe(
      '22 de mayo de 1991',
    )
    expect(en.capitalize(en.decade(1985))).toBe('1980s')
  })

  test('a date less than a year ahead is in the future', () => {
    const now = new Date(Date.UTC(2026, 9, 1))
    expect(en.ago('2026-12-25', now)).toBe('in 0 years')
  })

  test('slug drops unknown letters and joins apostrophes', () => {
    expect(en.slug('Guðrún')).toBe('gudrun')
    expect(en.slug("Assassin's Creed")).toBe('assassins-creed')
    expect(en.slug('Don’t Starve')).toBe('dont-starve')
    expect(en.slug('ポケモン Red')).toBe('red')
  })

  test('centuries before the year 1 fail clearly', () => {
    expect(() => es.century(-500)).toThrow("before AD 1 aren't supported")
  })

  test("the 1900s decade is never written '00", () => {
    expect(en.decade(1905, { short: true })).toBe('the 1900s')
    expect(en.decade(1985, { short: true })).toBe("the '80s")
  })

  test('a bad language tag fails with a quarry message', () => {
    expect(() => quarry('!!')).toThrow('"!!" is not a language tag')
  })

  test('a literal # can be written as \\#', () => {
    expect(en.plural(3, { other: '# entries in \\#1 ranking' })).toBe(
      '3 entries in #1 ranking',
    )
  })
})

describe('ordinals, centuries and one quarry per tag', () => {
  test('ordinals write the number as the language does', () => {
    expect(en.ordinal(1000000)).toBe('1,000,000th')
    expect(() => en.ordinal(2.5)).toThrow('2.5 has no ordinal')
  })

  test('French says premier for the first century and the first one', () => {
    const fr = quarry('fr')
    expect(fr.century(50)).toBe('Ier siècle')
    expect(fr.century(1985)).toBe('XXe siècle')
    expect(fr.ordinal(1, { gender: 'feminine' })).toBe('1re')
  })

  test("'00' is the first century", () => {
    expect(en.partialDate('00')).toBe('1st century')
  })

  test('one quarry per language, also when written with _', () => {
    expect(quarry('es_MX')).toBe(quarry('es-MX'))
    expect(quarry('es_MX').lang).toBe('es-MX')
  })

  test('Norwegian Bokmål and Nynorsk share the letter table', () => {
    expect(quarry('nb').slug('Bjørn')).toBe('bjoern')
    expect(quarry('nn').slug('Bjørn')).toBe('bjoern')
  })

  test('methods work on their own, taken out of the quarry', () => {
    const { slug, partialDate } = quarry('es')
    expect(slug('Tom & Jerry')).toBe('tom-y-jerry')
    expect(partialDate('198')).toBe('década de 1980')
  })
})

describe('ampersands, calendars, marks and caches', () => {
  test('each & is spelled out, however many', () => {
    expect(en.slug('R&D & Co')).toBe('r-and-d-and-co')
    expect(en.slug('A&B&C')).toBe('a-and-b-and-c')
  })

  test('dates are Gregorian unless another calendar is asked for', () => {
    const fa = quarry('fa')
    expect(fa.partialDate('1991')).toContain('۱۹۹۱')
    expect(fa.yearRange(1985, 1990)).toContain('۱۹۸۵')
    expect(fa.partialDate('1991', { calendar: 'persian' })).toContain('۱۳۶۹')
  })

  test('Greek keeps the accent of an initial capital', () => {
    expect(quarry('el').capitalize('άλφα')).toBe('Άλφα')
  })

  test('centuries past roman numerals still work where none are used', () => {
    expect(en.century(400000)).toBe('4,001st century')
  })

  test('every combining mark is dropped from slugs, never a separator', () => {
    expect(en.slug('abcガdef')).toBe(en.slug('abcカdef'))
  })

  test('ago never overstates a date known to the month', () => {
    const now = new Date(Date.UTC(2026, 9, 1))
    expect(en.ago('2025-10', now)).toBe('0 years ago')
    expect(en.ago('2025-09', now)).toBe('1 year ago')
  })

  test('one quarry per tag, whatever its case', () => {
    expect(quarry('ES')).toBe(quarry('es'))
    expect(quarry('es_mx')).toBe(quarry('es-MX'))
  })

  test('the English fallback writes English digits', () => {
    expect(quarry('ar').century(1985)).toBe('20th century')
  })

  test('years a date cannot hold fail with a quarry message', () => {
    expect(() => en.yearRange(1, 300000)).toThrow('quarry:')
    expect(() => en.ago(300000)).toThrow('quarry:')
  })
})

describe('years before AD 1, as ISO 8601 counts them', () => {
  test('0 is 1 BC and -1 is 2 BC, with their era written', () => {
    expect(en.partialDate('0000')).toBe('1 BC')
    expect(en.yearRange(-1, 5)).toContain('2 BC')
  })

  test('the single year 0 has no century; the years 0–99 are the 1st', () => {
    expect(() => en.century(0)).toThrow("before AD 1 aren't supported")
    expect(en.century('00')).toBe('1st century')
  })
})

describe('limits', () => {
  test('a roman-numeral century past 3999 says so', () => {
    expect(() => es.century(400000)).toThrow(
      'past what roman numerals can write',
    )
  })

  test('the first year a date can hold, and one before it', () => {
    expect(() => en.ago(-272000)).toThrow('past what dates can hold')
  })

  test('English variants keep their own digit grouping in ordinals', () => {
    expect(quarry('en-IN').ordinal(100000)).toBe('1,00,000th')
  })
})

describe('digits, visitors and types', () => {
  test('English words always go with Latin digits', () => {
    expect(quarry('en-u-nu-arab').ordinal(3)).toBe('3rd')
    expect(quarry('ar').century(1985)).toBe('20th century')
  })

  test('quarry.for never throws for a visitor tag', () => {
    expect(quarry.for('x-pirate')).toBe(quarry('en'))
    expect(quarry.for(null, 'es')).toBe(quarry('es'))
    expect(quarry.for('es_MX')).toBe(quarry('es-MX'))
    expect(() => quarry('x-pirate')).toThrow('is not a language tag')
  })

  test('the option types are public', async () => {
    const types = await import('./index')
    expect(types.quarry).toBeFunction()
    const calendar: import('./index').CalendarOptions = { calendar: 'gregory' }
    const gender: import('./index').Gender = 'feminine'
    expect([calendar, gender]).toHaveLength(2)
  })
})
const NBSP = ' '
const clean = (text: string) => text.replaceAll(/[  ]/g, ' ')

describe('partialDate with a time', () => {
  test('keeps the day as written, whatever the time or offset', () => {
    expect(es.partialDate('1884-04-06T23:00:00+00:00')).toBe(
      '6 de abril de 1884',
    )
    expect(es.partialDate('2026-10-21 18:57:03')).toBe('21 de octubre de 2026')
    expect(es.partialDate('2026-10-21T02:00:00Z')).toBe('21 de octubre de 2026')
    expect(es.partialDate('2026-10-21T02:00:00.123-06:00')).toBe(
      '21 de octubre de 2026',
    )
    expect(es.partialDate('2026-10-21T02:00')).toBe('21 de octubre de 2026')
  })

  test('still refuses what is not a date', () => {
    expect(() => es.partialDate('2026-10-21 whenever')).toThrow('quarry:')
    expect(() => es.partialDate('2026-10T02:00')).toThrow('quarry:')
    expect(() => es.partialDate('2026-02-30T02:00')).toThrow('quarry:')
  })
})

describe('date', () => {
  const late = new Date('2026-10-21T02:00:00Z')

  test('reads the moment in the time zone asked for', () => {
    const timeZone = 'America/Monterrey'
    expect(es.date(late, { timeZone })).toBe('20 de octubre de 2026')
    expect(es.date(late, { timeZone: 'UTC' })).toBe('21 de octubre de 2026')
  })

  test('fields add to the full date', () => {
    const timeZone = 'UTC'
    expect(es.date(late, { timeZone, month: 'short' })).toBe('21 oct 2026')
    expect(clean(en.date(late, { timeZone, hour: 'numeric' }))).toContain(
      'October 21, 2026',
    )
  })

  test('styles go to Intl alone', () => {
    const timeZone = 'UTC'
    expect(es.date(late, { timeZone, timeStyle: 'short' })).toBe('2:00')
  })

  test('refuses an invalid date', () => {
    expect(() => es.date(new Date('nope'))).toThrow('quarry:')
  })
})

describe('relative', () => {
  const now = new Date('2026-10-30T09:00:00Z')
  const timeZone = 'UTC'
  const from = (at: string, more = {}) =>
    es.relative(new Date(at), { now, timeZone, ...more })

  test('counts elapsed time under a day', () => {
    expect(from('2026-10-30T07:00:00Z')).toBe('hace 2 horas')
    expect(from('2026-10-30T08:58:00Z')).toBe('hace 2 minutos')
    expect(from('2026-10-30T08:59:30Z')).toBe('este minuto')
  })

  test('last night is hours, not yesterday', () => {
    expect(from('2026-10-29T23:00:00Z')).toBe('hace 10 horas')
  })

  test('counts calendar days from a day on', () => {
    expect(from('2026-10-29T08:00:00Z')).toBe('ayer')
    expect(from('2026-10-28T23:00:00Z')).toBe('anteayer') // 34 h, not "ayer"
    expect(from('2026-10-26T09:00:00Z')).toBe('hace 4 días')
  })

  test('climbs to weeks, months and years, never overstating', () => {
    expect(from('2026-10-16T09:00:00Z')).toBe('hace 2 semanas')
    expect(from('2026-08-30T09:00:00Z')).toBe('hace 2 meses')
    expect(from('2026-09-01T09:00:00Z')).toBe('el mes pasado')
    expect(from('2024-10-30T09:00:00Z')).toBe('hace 2 años')
    expect(from('2024-11-01T09:00:00Z')).toBe('el año pasado')
  })

  test('goes into the future', () => {
    expect(from('2026-10-30T11:00:00Z')).toBe('dentro de 2 horas')
    expect(from('2026-10-31T10:00:00Z')).toBe('mañana')
    expect(from('2028-10-30T09:00:00Z')).toBe('dentro de 2 años')
  })

  test('counts days in the time zone asked for', () => {
    const at = '2026-10-29T03:00:00Z' // the 28th, 21:00, in Monterrey
    const late = new Date('2026-10-30T04:00:00Z') // the 29th, 22:00, there
    const q = (timeZone: string) =>
      es.relative(new Date(at), { now: late, timeZone })
    expect(q('America/Monterrey')).toBe('ayer')
    expect(q('UTC')).toBe('ayer')
    const near = new Date('2026-10-30T06:30:00Z') // the 30th, 00:30, there
    expect(
      es.relative(new Date(at), { now: near, timeZone: 'America/Monterrey' }),
    ).toBe('anteayer')
  })

  test('uses only the units allowed', () => {
    expect(from('2026-10-01T09:00:00Z', { units: ['day'] })).toBe(
      'hace 29 días',
    )
    expect(from('2026-10-30T07:00:00Z', { units: ['minute'] })).toBe(
      'hace 120 minutos',
    )
    expect(from('2026-10-29T23:00:00Z', { units: ['day'] })).toBe('ayer')
    expect(from('2026-10-30T08:59:30Z', { units: ['second'] })).toBe(
      'hace 30 segundos',
    )
  })

  test('passes style and numeric to Intl', () => {
    expect(from('2026-10-30T08:58:00Z', { style: 'short' })).toBe('hace 2 min')
    expect(from('2026-10-29T08:00:00Z', { numeric: 'always' })).toBe(
      'hace 1 día',
    )
  })

  test('refuses an invalid date or no units', () => {
    expect(() => es.relative(new Date('nope'))).toThrow('quarry:')
    expect(() => es.relative(now, { units: [] })).toThrow('quarry:')
  })
})

describe('bytes', () => {
  test('counts in 1000s with the largest unit', () => {
    expect(clean(es.bytes(1_887_436))).toBe('1,9 MB')
    expect(clean(es.bytes(51_200))).toBe('51,2 kB')
    expect(clean(en.bytes(2_000_000_000))).toBe('2 GB')
    expect(clean(es.bytes(0))).toBe('0 B')
  })

  test('steps up when rounding reaches the next unit', () => {
    expect(clean(en.bytes(999_999))).toBe('1 MB')
    expect(clean(en.bytes(999_940))).toBe('999.9 kB')
  })

  test('binary counts in 1024s and says so', () => {
    expect(es.bytes(1_887_436, { binary: true })).toBe(`1,8${NBSP}MiB`)
    expect(en.bytes(1024, { binary: true })).toBe(`1${NBSP}KiB`)
    expect(clean(en.bytes(512, { binary: true }))).not.toContain('KiB')
  })

  test('passes number options through', () => {
    expect(clean(en.bytes(1_234_567, { maximumFractionDigits: 2 }))).toBe(
      '1.23 MB',
    )
  })

  test('stops at the largest unit and keeps the sign', () => {
    expect(clean(en.bytes(5e18))).toBe('5,000 PB')
    expect(clean(en.bytes(-2_000_000))).toBe('-2 MB')
  })

  test('refuses what is not a number', () => {
    expect(() => en.bytes(NaN)).toThrow('quarry:')
  })
})

describe('duration', () => {
  test('splits the unit given', () => {
    expect(es.duration({ minutes: 190 })).toBe('3 h y 10 min')
    expect(es.duration({ seconds: 11400 }, { style: 'long' })).toBe(
      '3 horas y 10 minutos',
    )
    expect(es.duration({ hours: 1, minutes: 90 })).toBe('2 h y 30 min')
    expect(en.duration({ hours: 50 })).toBe('2 days, 2 hr')
  })

  test('rounds to the smallest unit given', () => {
    expect(es.duration({ minutes: 12.4 })).toBe('12 min')
    expect(es.duration({ minutes: 59.6 })).toBe('1 h')
  })

  test('units limits how many show, rounding to the last', () => {
    expect(es.duration({ minutes: 190 }, { units: 1 })).toBe('3 h')
    expect(es.duration({ minutes: 230 }, { units: 1 })).toBe('4 h')
    expect(es.duration({ seconds: 3661 }, { units: 2 })).toBe('1 h y 1 min')
    expect(es.duration({ minutes: 10 }, { units: 3 })).toBe('10 min')
  })

  test('zero still says its unit', () => {
    expect(es.duration({ minutes: 0 })).toBe('0 min')
    expect(es.duration({ minutes: 0.2 })).toBe('0 min')
  })

  test('passes other styles through', () => {
    expect(es.duration({ minutes: 190 }, { style: 'narrow' })).toBe('3h 10min')
    expect(es.duration({ minutes: 190 }, { style: 'digital' })).toBe('3:10:00')
  })

  test('refuses nothing, negatives and non-numbers', () => {
    expect(() => es.duration({})).toThrow('quarry:')
    expect(() => es.duration({ minutes: -1 })).toThrow('quarry:')
    expect(() => es.duration({ minutes: NaN })).toThrow('quarry:')
  })

  test('units is a whole number, one or more', () => {
    for (const units of [0, -1, 1.5])
      expect(() => es.duration({ minutes: 190 }, { units })).toThrow(
        `quarry: units ${units} can't say how many units to show`,
      )
  })
})

describe('month and weekday', () => {
  test('name a month', () => {
    expect(es.month(9)).toBe('septiembre')
    expect(es.month(9, { style: 'short' })).toBe('sept')
    expect(en.month(1, { style: 'narrow' })).toBe('J')
  })

  test('weekdays are ISO: 1 is Monday, 7 is Sunday', () => {
    expect(en.weekday(1)).toBe('Monday')
    expect(es.weekday(7)).toBe('domingo')
    expect(es.weekday(7, { style: 'short' })).toBe('dom')
  })

  test('refuse what does not exist', () => {
    for (const bad of [0, 13, 1.5])
      expect(() => es.month(bad)).toThrow('quarry:')
    for (const bad of [0, 8, 1.5])
      expect(() => es.weekday(bad)).toThrow('quarry:')
  })

  test('months lists all twelve in order', () => {
    const months = es.months({ style: 'short' })
    expect(months).toHaveLength(12)
    expect(months[0]).toBe('ene')
    expect(months[8]).toBe('sept')
  })

  test('weekdays start where the language starts the week', () => {
    expect(quarry('es-MX').weekdays({ style: 'short' })[0]).toEqual({
      day: 7,
      name: 'dom',
    })
    expect(quarry('es-ES').weekdays()[0]).toEqual({ day: 1, name: 'lunes' })
    expect(quarry('es-MX').weekdays()).toHaveLength(7)
    expect(quarry('es-MX').weekdays()[6]!.day).toBe(6)
  })
})

describe('names of codes', () => {
  test('one method per kind of code', () => {
    expect(en.language('es')).toBe('Spanish')
    expect(es.region('JP')).toBe('Japón')
    expect(es.currency('MXN')).toBe('peso mexicano')
    expect(es.script('Latn')).toBe('latino')
    expect(es.calendar('gregory')).toBe('calendario gregoriano')
    expect(es.field('month')).toBe('mes')
  })

  test('passes options through', () => {
    expect(
      es.capitalize(es.language('pt-BR', { languageDisplay: 'standard' })),
    ).toBe('Portugués (Brasil)')
    expect(es.region('US', { style: 'short' })).toBe('EE. UU.')
  })

  test('gives nothing for what has no name, or is no code', () => {
    for (const code of [null, '', 'und', 'xx', 'not a code!'])
      expect(es.language(code)).toBe('')
    expect(es.field('nope')).toBe('')
  })

  test('keeps the name Intl has for an unknown region', () => {
    expect(es.region('ZZ')).toBe('Región desconocida')
  })
})

test('the new methods are bound, like the others', () => {
  const { bytes, duration, month, language, date, relative } = en
  expect(clean(bytes(1000))).toBe('1 kB')
  expect(duration({ minutes: 5 })).toBe('5 min')
  expect(month(1)).toBe('January')
  expect(language('en')).toBe('English')
  expect(date(new Date(0), { timeZone: 'UTC' })).toBe('January 1, 1970')
  expect(relative(new Date(0), { now: new Date(1000) })).toBe('this minute')
})
