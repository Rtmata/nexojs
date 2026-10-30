import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import {
  DigitalDuration,
  durationWriter,
  ListedDuration,
} from './duration-writers'
import { Durations, type Duration } from './durations'
import { Formats } from './formats'

const LANGUAGES = [
  'es',
  'en',
  'de',
  'fr',
  'pt',
  'ja',
  'ar',
  'ru',
  'zh',
  'fi',
  'da',
]
const native = (lang: string, style: Intl.DurationFormatOptions['style']) =>
  new Intl.DurationFormat(lang, { style })

describe('without the platform writer, the text is the same', () => {
  const durations: Duration[] = [
    { hours: 3, minutes: 10 },
    { minutes: 12 },
    { days: 2, hours: 1 },
    { hours: 1, seconds: 5 },
    { days: 1, hours: 2, minutes: 3, seconds: 4 },
    { minutes: 1 },
  ]

  for (const lang of LANGUAGES)
    for (const style of ['long', 'short', 'narrow'] as const)
      test(`${lang} ${style}`, () => {
        const listed = new ListedDuration(new Formats(lang), style)
        for (const each of durations)
          expect(listed.format(each)).toBe(native(lang, style).format(each))
      })

  const clocks: Duration[] = [
    { hours: 3, minutes: 10 },
    { minutes: 10 },
    { seconds: 5 },
    { days: 2, hours: 1 },
    { hours: 1, seconds: 5 },
    { seconds: 1, milliseconds: 500 },
    { milliseconds: 5 },
  ]

  for (const lang of LANGUAGES)
    test(`${lang} digital`, () => {
      const digital = new DigitalDuration(new Formats(lang))
      for (const each of clocks)
        expect(digital.format(each)).toBe(native(lang, 'digital').format(each))
    })
})

describe('durationWriter', () => {
  const formats = new Formats('es')

  test('takes the platform writer when it exists', () => {
    const writer = durationWriter(formats, { style: 'short' })
    expect(writer).toBeInstanceOf(Intl.DurationFormat)
  })

  test('builds its own when it does not', () => {
    const short = durationWriter(formats, { style: 'short' }, null)
    const digital = durationWriter(formats, { style: 'digital' }, null)
    expect(short).toBeInstanceOf(ListedDuration)
    expect(digital).toBeInstanceOf(DigitalDuration)
  })
})

describe('on an engine without Intl.DurationFormat', () => {
  const real = Intl.DurationFormat
  const missing = Intl as { DurationFormat?: typeof Intl.DurationFormat }
  beforeAll(() => delete missing.DurationFormat)
  afterAll(() => {
    missing.DurationFormat = real
  })

  test('duration works the same, zero included', () => {
    const durations = new Durations(new Formats('es'))
    expect(durations.duration({ minutes: 190 })).toBe('3 h y 10 min')
    expect(durations.duration({ minutes: 0 })).toBe('0 min')
    expect(durations.duration({ minutes: 190 }, { units: 1 })).toBe('3 h')
    expect(durations.duration({ minutes: 190 }, { style: 'long' })).toBe(
      '3 horas y 10 minutos',
    )
    expect(durations.duration({ minutes: 190 }, { style: 'digital' })).toBe(
      '3:10:00',
    )
  })
})
