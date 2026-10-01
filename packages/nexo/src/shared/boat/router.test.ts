import { describe, expect, test } from 'bun:test'
import { boat } from './router'
import type { Handler } from './types'

const ok: Handler = () => new Response('ok')

describe('boat', () => {
  test('finds a route and its params', () => {
    const router = boat().get('/consola/:id', ok)
    const found = router.match('GET', '/consola/nes')

    expect(found?.route.pattern.path).toBe('/consola/:id')
    expect(found?.params).toEqual({ id: 'nes' })
  })

  test('matches by method', () => {
    const router = boat().post('/favoritos', ok)

    expect(router.match('POST', '/favoritos')).not.toBeNull()
    expect(router.match('GET', '/favoritos')).toBeNull()
  })

  test('the most specific route wins, whatever the order', () => {
    const router = boat()
      .get('/consola/*', ok)
      .get('/consola/:id', ok)
      .get('/consola/nes', ok)

    expect(router.match('GET', '/consola/nes')?.route.pattern.path).toBe(
      '/consola/nes',
    )
    expect(router.match('GET', '/consola/snes')?.route.pattern.path).toBe(
      '/consola/:id',
    )
    expect(
      router.match('GET', '/consola/snes/juegos')?.route.pattern.path,
    ).toBe('/consola/*')
  })

  test('throws when two routes match exactly the same URLs', () => {
    const router = boat().get('/consola/:id', ok)

    expect(() => router.get('/consola/:slug', ok)).toThrow(
      'match exactly the same URLs',
    )
  })

  test('the same shape is fine for different methods', () => {
    expect(() =>
      boat().get('/favoritos/:id', ok).delete('/favoritos/:id', ok),
    ).not.toThrow()
  })

  test('lists the allowed methods for a path', () => {
    const router = boat().get('/favoritos/:id', ok).delete('/favoritos/:id', ok)

    expect(router.allowed('/favoritos/1').sort()).toEqual(['DELETE', 'GET'])
    expect(router.allowed('/nada')).toEqual([])
  })

  test('has default 404 and 500 handlers that can be replaced', async () => {
    const router = boat()
    const ctx = {
      request: new Request('http://x/'),
      url: new URL('http://x/'),
      params: {},
      link: router.href,
    }

    expect((await router.notFoundHandler(ctx)).status).toBe(404)
    expect((await router.errorHandler({ ...ctx, error: 'boom' })).status).toBe(
      500,
    )

    const lost: Handler = () => new Response('lost', { status: 404 })
    router.notFound(lost)
    expect(router.notFoundHandler).toBe(lost)
  })
})
