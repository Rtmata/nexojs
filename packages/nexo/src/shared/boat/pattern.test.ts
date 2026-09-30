import { describe, expect, test } from 'bun:test'
import {
  compareSpecificity,
  matchPattern,
  parsePattern,
  shapeOf,
  splitPath,
} from './pattern'

const match = (path: string, pathname: string) =>
  matchPattern(parsePattern(path), splitPath(pathname))

describe('splitPath', () => {
  test('root has no segments', () => {
    expect(splitPath('/')).toEqual([])
  })

  test('ignores a trailing slash', () => {
    expect(splitPath('/consola/nes/')).toEqual(['consola', 'nes'])
  })
})

describe('parsePattern', () => {
  test('parses static, param and wildcard segments', () => {
    expect(parsePattern('/consola/:id/*').segments).toEqual([
      { kind: 'static', value: 'consola' },
      { kind: 'param', name: 'id' },
      { kind: 'wildcard' },
    ])
  })

  test('rejects malformed paths', () => {
    expect(() => parsePattern('consola')).toThrow('must start with "/"')
    expect(() => parsePattern('/*/juegos')).toThrow('last segment')
    expect(() => parsePattern('/consola/:')).toThrow('empty parameter')
    expect(() => parsePattern('/:id/:id')).toThrow('repeated')
  })
})

describe('matchPattern', () => {
  test('matches static paths exactly', () => {
    expect(match('/', '/')).toEqual({})
    expect(match('/consolas', '/consolas')).toEqual({})
    expect(match('/consolas', '/juegos')).toBeNull()
  })

  test('captures params', () => {
    expect(match('/consola/:id', '/consola/nes')).toEqual({ id: 'nes' })
  })

  test('decodes params', () => {
    expect(match('/juego/:slug', '/juego/pok%C3%A9mon')).toEqual({
      slug: 'pokémon',
    })
  })

  test('rejects missing or extra segments', () => {
    expect(match('/consola/:id', '/consola')).toBeNull()
    expect(match('/consola/:id', '/consola/nes/juegos')).toBeNull()
  })

  test('wildcard captures the rest, including nothing', () => {
    expect(match('/covers/*', '/covers/nes/zelda.png')).toEqual({
      '*': 'nes/zelda.png',
    })
    expect(match('/covers/*', '/covers')).toEqual({ '*': '' })
  })
})

describe('shapeOf', () => {
  test('erases param names', () => {
    expect(shapeOf(parsePattern('/consola/:id'))).toBe(
      shapeOf(parsePattern('/consola/:slug')),
    )
  })
})

describe('compareSpecificity', () => {
  const more = (a: string, b: string) =>
    compareSpecificity(parsePattern(a), parsePattern(b)) > 0

  test('static beats param beats wildcard', () => {
    expect(more('/consola/nes', '/consola/:id')).toBe(true)
    expect(more('/consola/:id', '/consola/*')).toBe(true)
  })
})
