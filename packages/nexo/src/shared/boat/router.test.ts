import { describe, expect, test } from 'bun:test'
import { route } from './route'
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

describe('specificity, encoded URLs, links and redirects', () => {
  // Takes any context, so it fits routes of any language list.
  const fine = () => new Response('ok')

  test('an exact path beats a wildcard that would capture nothing', () => {
    const router = boat().get('/covers/*', ok).get('/covers', ok)

    expect(router.match('GET', '/covers')?.route.pattern.path).toBe('/covers')
    expect(router.match('GET', '/covers/a/b')?.params).toEqual({ '*': 'a/b' })
  })

  test("a wildcard doesn't match an encoded slash", () => {
    const router = boat().get('/old/*', ok)

    expect(router.match('GET', '/old/a%2F..%2F..%2Fetc')).toBeNull()
  })

  test('static segments compare decoded, and links encode them once', () => {
    const router = boat().get('cafe', '/caf%C3%A9', ok)

    expect(router.match('GET', '/caf%C3%A9')).not.toBeNull()
    expect(router.href('cafe')).toBe('/caf%C3%A9')
  })

  test('a route without a handler or a path fails at registration', () => {
    expect(() => (boat().get as any)('/x')).toThrow('needs a handler')
    expect(() => (boat().get as any)('about', ok)).toThrow('needs a path')
  })

  test('a link in an unknown language fails, even to a single-path route', () => {
    const router = boat({ languages: ['en', 'es'] }).get(
      'about',
      '/about',
      fine,
    )

    expect(router.href('about', undefined, 'es')).toBe('/about')
    expect(() => router.href('about', undefined, 'zz' as any)).toThrow(
      '"zz" is not one of the languages ("en", "es")',
    )
  })

  test('linkFor falls back like a route does', () => {
    const router = boat({ languages: ['en', 'es'] }).get(
      'credits',
      { en: '/credits' },
      fine,
      { only: ['en'] },
    )

    expect(router.linkFor('es')('credits')).toBe('/credits')
  })

  test('a chain of rules asks each one to place a shared path', () => {
    const router = boat({
      languages: ['en', 'es'],
      langFrom: ['subdomain', { query: 'lang' }],
    }).get('arcade', { en: '/arcade', es: '/arcade' }, fine)
    const url = new URL('http://www.example.com/arcade')

    expect(router.alternates({ url, lang: 'en' })).toEqual({
      en: '/arcade?lang=en',
      es: '/arcade?lang=es',
    })
  })

  test('a language read from the URL must be the very tag', () => {
    const router = boat({ languages: ['es', 'en'], langFrom: 'prefix' })
    const at = (path: string) => new Request(`http://x${path}`)

    expect(router.langOf(at('/es/a'))).toBe('es')
    expect(router.langOf(at('/es-tienda/a'))).toBeUndefined()
  })

  test('a link takes a declared language in any case', () => {
    const router = boat({ languages: ['es-MX', 'en'] }).get(
      'home',
      { 'es-MX': '/', en: '/en' },
      fine,
    )

    expect(router.href('home', undefined, 'es-mx' as any)).toBe('/')
  })

  test('static text never reads as a param or a wildcard', () => {
    const router = boat()
      .get('/%3A', fine)
      .get('/:id', fine)
      .get('/a/%2A', fine)

    expect(() => router.get('/a/*', fine)).not.toThrow()
    expect(router.match('GET', '/%3A')?.route.pattern.path).toBe('/%3A')
  })

  test('alternates keep the languages that have a path of their own', () => {
    const router = boat({
      languages: ['en', 'es', 'fr'],
      langFrom: { cookie: 'lang' },
    }).get('arcade', { en: '/arcade', es: '/arcade', fr: '/fr/arcade' }, fine)
    const url = new URL('http://x/fr/arcade')

    expect(router.alternates({ url, lang: 'fr' })).toEqual({ fr: '/fr/arcade' })
  })

  test('a redirect to itself fails at registration', () => {
    expect(() => boat().redirect('/a', '/a')).toThrow('back to the same URL')
    expect(() => boat().redirect('/old/:id', '/old/:id')).toThrow(
      'back to the same URL',
    )
  })

  test('a redirect needs a GET route at its target', () => {
    const router = boat().post('save', '/save', fine).redirect('/old', 'save')

    expect(() => router.check()).toThrow('no GET route has that name')
  })

  test('links to a route() check the params of the language asked', () => {
    const page = route('c', { en: '/en/c/:id', es: '/es/c/:slug' })
    // @ts-expect-error 'es' takes :slug, not :id
    expect(() => page.href({ id: '1' }, 'es')).toThrow()
    expect(page.href({ slug: 'uno' }, 'es')).toBe('/es/c/uno')
  })
})

describe('redirects language by language, and paths no URL can match', () => {
  const fine = () => new Response('ok')

  test('a redirect to its own name loops, even before the name exists', () => {
    expect(() =>
      boat({ languages: ['en', 'es'] }).redirect(
        'legacy',
        { en: '/en/legacy', es: '/es/legado' },
        'legacy',
      ),
    ).toThrow('back to the same URL')
  })

  test('paths that match the same URLs loop, also in one language only', () => {
    expect(() => boat().redirect('/old/', '/old')).toThrow(
      'back to the same URL',
    )
    expect(() =>
      boat({ languages: ['en', 'es'] }).redirect(
        'old',
        { en: '/en/old', es: '/es/viejo' },
        '/en/old',
      ),
    ).toThrow('back to the same URL')
  })

  test('each language fills the target path of its own language', () => {
    const router = boat({ languages: ['en', 'es'] }).get(
      'c',
      { en: '/en/c/:id', es: '/es/c/:slug' },
      fine,
    )
    expect(() =>
      router.redirect('old', { en: '/en/old/:id', es: '/es/viejo/:slug' }, 'c'),
    ).not.toThrow()
  })

  test('a fixed target is written as a valid Location', async () => {
    const router = boat().redirect('/a', '/漢字')
    const found = router.match('GET', '/a')!
    const response = await found.route.handler({ params: {} } as any)
    expect(response.headers.get('location')).toBe('/%E6%BC%A2%E5%AD%97')
  })

  test('dot segments and encoded separators are refused in route paths', () => {
    expect(() => boat().get('/a/../b', fine)).toThrow('which browsers collapse')
    expect(() => boat().get('/files/a%2Fb', fine)).toThrow(
      'which no URL can match',
    )
  })

  test('language keys may be spelled any way', () => {
    const router = boat({ languages: ['es-MX', 'en'] }).get(
      'p',
      { 'es-mx': '/es/p', en: '/en/p' },
      fine,
    )
    expect(router.href('p', undefined, 'ES_MX' as any)).toBe('/es/p')
  })

  test('the prefix is read decoded, as routes read it; a cookie is decoded', () => {
    const router = boat({ languages: ['es', 'en'], langFrom: 'prefix' })
    expect(router.langOf(new Request('http://x/%65s/a'))).toBe('es')
    const byCookie = boat({
      languages: ['es-MX', 'en'],
      langFrom: { cookie: 'lang' },
    })
    const request = new Request('http://x/', {
      headers: { cookie: 'lang=es%2DMX' },
    })
    expect(byCookie.langOf(request)).toBe('es-MX')
  })
})
