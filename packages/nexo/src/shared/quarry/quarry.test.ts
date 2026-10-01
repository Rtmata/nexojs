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
    expect(en.partialDate('19')).toBe('1900s')
    expect(es.partialDate('19')).toBe('años 1900')
  })

  test('languages without words for decades fall back to the English form', () => {
    expect(quarry('fr').partialDate('198')).toBe('1980s')
    expect(quarry('es-MX').partialDate('198')).toBe('década de 1980')
  })

  test('is empty for no date and strict about the format', () => {
    expect(en.partialDate(null)).toBe('')
    expect(() => en.partialDate('May 1991')).toThrow('not a partial ISO date')
  })
})
