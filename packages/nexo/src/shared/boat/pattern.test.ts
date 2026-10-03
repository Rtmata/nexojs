import { describe, expect, test } from 'bun:test'
import { decodedSegments, splitSegments } from '../url/decode'
import { Pattern } from './pattern'

const match = (path: string, pathname: string) =>
  new Pattern(path).match(decodedSegments(pathname) ?? [])

describe('splitSegments', () => {
  test('root has no segments', () => {
    expect(splitSegments('/')).toEqual([])
  })

  test('ignores a trailing slash', () => {
    expect(splitSegments('/consola/nes/')).toEqual(['consola', 'nes'])
  })
})

describe('parsePattern', () => {
  test('parses static, param and wildcard segments', () => {
    expect(new Pattern('/consola/:id/*').segments).toEqual([
      { kind: 'static', value: 'consola' },
      { kind: 'param', name: 'id' },
      { kind: 'wildcard' },
    ])
  })

  test('rejects malformed paths', () => {
    expect(() => new Pattern('consola')).toThrow('must start with "/"')
    expect(() => new Pattern('/*/juegos')).toThrow('last segment')
    expect(() => new Pattern('/consola/:')).toThrow('empty parameter')
    expect(() => new Pattern('/:id/:id')).toThrow('repeated')
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
    expect(new Pattern('/consola/:id').shape).toBe(
      new Pattern('/consola/:slug').shape,
    )
  })
})

describe('compareSpecificity', () => {
  const more = (a: string, b: string) =>
    new Pattern(a).compare(new Pattern(b)) > 0

  test('static beats param beats wildcard', () => {
    expect(more('/consola/nes', '/consola/:id')).toBe(true)
    expect(more('/consola/:id', '/consola/*')).toBe(true)
  })
})
