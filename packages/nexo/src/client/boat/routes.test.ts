import { describe, expect, test } from 'bun:test'
import { routes } from './routes'

const page = { page: () => null }

describe('client routes', () => {
  test('two paths for the same URLs throw at once, as on the server', () => {
    expect(() => routes({ '/book/:id': page, '/book/:slug': page })).toThrow(
      'boat: "/book/:slug" and "/book/:id" match exactly the same URLs. Change one of the paths',
    )
  })

  test('the most specific still wins among paths that differ', () => {
    const match = routes({ '/book/:id': page, '/book/new': page })
    expect(match(new URL('http://x/book/new'))?.params).toEqual({})
    expect(match(new URL('http://x/book/7'))?.params).toEqual({ id: '7' })
  })
})
