import { describe, expect, test } from 'bun:test'
import { route } from './route'
import { boat } from './router'
import type { Context } from './types'

const ok = () => new Response('ok')

/** Call the route that answers a URL, as keep would. */
async function visit(router: ReturnType<typeof boat<any>>, url: string) {
  const parsed = new URL(url, 'http://x')
  const found = router.match('GET', parsed.pathname)
  if (!found) throw new Error(`no route for ${url}`)
  const ctx: Context = {
    request: new Request(parsed),
    url: parsed,
    params: found.params,
    link: router.href,
  }
  return found.route.handler(ctx)
}

describe('routes per language', () => {
  test('each language is a normal route, and ctx.lang says which one answered', async () => {
    const router = boat({ languages: ['en', 'es'] })
    router.get(
      'console',
      { en: '/en/console/:id', es: '/es/consola/:id' },
      (ctx) => new Response(`${ctx.lang}:${ctx.params.id}`),
    )

    expect(router.routes.map((r) => [r.pattern.path, r.lang])).toEqual([
      ['/en/console/:id', 'en'],
      ['/es/consola/:id', 'es'],
    ])
    expect(await (await visit(router, '/es/consola/nes')).text()).toBe('es:nes')
    expect(await (await visit(router, '/en/console/nes')).text()).toBe('en:nes')
  })

  test('a missing language throws when the route is registered', () => {
    const router = boat({ languages: ['en', 'es'] })
    expect(() => router.get('console', { es: '/es/consola/:id' }, ok)).toThrow(
      'route "console" has no path for "en"',
    )
  })

  test('{ only } allows a route in fewer languages on purpose', () => {
    const router = boat({ languages: ['en', 'es'] })
    router.get('press', { es: '/es/prensa' }, ok, { only: ['es'] })
    expect(router.href('press', {}, 'es')).toBe('/es/prensa')
    expect(() => router.href('press', {}, 'en')).toThrow('has no "en" version')
  })

  test('an undeclared language throws', () => {
    const router = boat({ languages: ['en', 'es'] })
    expect(() =>
      router.get(
        'console',
        { en: '/en/c', es: '/es/c', pt: '/pt/c' } as any,
        ok,
      ),
    ).toThrow('uses language "pt"')
  })

  test('paths per language need declared languages', () => {
    expect(() => boat().get('console', { en: '/en/c' }, ok)).toThrow(
      'no languages were declared',
    )
  })
})

describe('href', () => {
  const router = boat({ languages: ['en', 'es'] })
  router.get('console', { en: '/en/console/:id', es: '/es/consola/:id' }, ok)
  router.get('about', '/about', ok)
  router.get('/plain', ok)

  test('fills the path of the requested language', () => {
    expect(router.href('console', { id: 'nes' }, 'es')).toBe('/es/consola/nes')
    expect(router.href('console', { id: 'nes' }, 'en')).toBe('/en/console/nes')
  })

  test('named single-path routes need no language', () => {
    expect(router.href('about')).toBe('/about')
  })

  test('encodes values', () => {
    expect(router.href('console', { id: 'a b/c' }, 'en')).toBe(
      '/en/console/a%20b%2Fc',
    )
  })

  test('fails loudly on unknown names, missing params or no language', () => {
    expect(() => router.href('consol', { id: 'nes' }, 'es')).toThrow(
      'no route named "consol"',
    )
    expect(() => router.href('console', {}, 'es')).toThrow(
      'needs the param "id"',
    )
    expect(() => router.href('console', { id: 'nes', x: 1 }, 'es')).toThrow(
      'has no param "x"',
    )
    expect(() => router.href('console', { id: 'nes' })).toThrow(
      'say which one to link to',
    )
  })

  test('ctx.link uses the language of the route that answered', async () => {
    const r = boat({ languages: ['en', 'es'] })
    r.get(
      'console',
      { en: '/en/console/:id', es: '/es/consola/:id' },
      (ctx) => new Response(ctx.link('console', { id: 'snes' })),
    )
    expect(await (await visit(r, '/es/consola/nes')).text()).toBe(
      '/es/consola/snes',
    )
  })

  test('the same name may be reused only with the same paths (GET and POST of one page)', () => {
    const r = boat()
    r.get('vote', '/vote', ok)
    r.post('vote', '/vote', ok)
    expect(() => r.put('vote', '/other', ok)).toThrow(
      'two different routes are named "vote"',
    )
  })
})

describe('alternates', () => {
  test('gives the current page in every language', () => {
    const router = boat({ languages: ['en', 'es'] })
    router.get('console', { en: '/en/console/:id', es: '/es/consola/:id' }, ok)
    router.get('/plain', ok)

    expect(
      router.alternates({ url: new URL('http://x/es/consola/nes') }),
    ).toEqual({
      en: '/en/console/nes',
      es: '/es/consola/nes',
    })
    expect(router.alternates({ url: new URL('http://x/plain') })).toEqual({})
  })
})

describe('route()', () => {
  const consoleRoute = route('console', {
    en: '/en/console/:id',
    es: '/es/consola/:id',
  })
  const aboutRoute = route('about', '/about')

  test('builds links on its own, without a router', () => {
    expect(consoleRoute.href({ id: 'nes' }, 'es')).toBe('/es/consola/nes')
    expect(aboutRoute.href()).toBe('/about')
  })

  test('registers like any named route', async () => {
    const router = boat({ languages: ['en', 'es'] })
    router.get(consoleRoute, (ctx) => new Response(ctx.lang))
    expect(await (await visit(router, '/en/console/nes')).text()).toBe('en')
    expect(router.href('console', { id: 'nes' }, 'en')).toBe('/en/console/nes')
    expect(router.href(consoleRoute, { id: 'nes' }, 'en')).toBe(
      '/en/console/nes',
    )
  })

  test('the editor checks params and languages', () => {
    // @ts-expect-error: `id` is required
    expect(() => consoleRoute.href({}, 'es')).toThrow()
    // @ts-expect-error: 'pt' is not one of its languages
    expect(() => consoleRoute.href({ id: 'nes' }, 'pt')).toThrow()
  })
})

describe('{ load, page }', () => {
  const machines: Record<string, { name: string }> = { nes: { name: 'NES' } }

  test('page receives what load returned', async () => {
    const router = boat()
    router.get('/consola/:id', {
      load: (ctx) =>
        machines[ctx.params.id] ?? new Response('lost', { status: 404 }),
      page: (machine) => new Response(machine.name),
    })
    expect(await (await visit(router, '/consola/nes')).text()).toBe('NES')
  })

  test('a Response from load ends the request and page never runs', async () => {
    const router = boat()
    let pageRan = false
    router.get('/consola/:id', {
      load: (ctx) =>
        machines[ctx.params.id] ?? new Response('lost', { status: 404 }),
      page: (machine) => {
        pageRan = true
        return new Response(machine.name)
      },
    })
    const response = await visit(router, '/consola/zx')
    expect(response.status).toBe(404)
    expect(pageRan).toBe(false)
  })

  test('works with async loaders', async () => {
    const router = boat()
    router.get('/slow', {
      load: async () => ({ n: 42 }),
      page: (data) => new Response(String(data.n)),
    })
    expect(await (await visit(router, '/slow')).text()).toBe('42')
  })
})

describe('langFrom', () => {
  const request = (url: string, headers: Record<string, string> = {}) =>
    new Request(new URL(url, 'http://museum.test'), { headers })

  test('reads the language each way, only from declared languages', () => {
    const of = (langFrom: any, req: Request) =>
      boat({ languages: ['en', 'es'], langFrom }).langOf(req)

    expect(of('prefix', request('/es/consola/nes'))).toBe('es')
    expect(of('prefix', request('/fr/x'))).toBeUndefined()
    expect(of('subdomain', request('http://es.museum.test/arcade'))).toBe('es')
    expect(
      of(
        'header',
        request('/', { 'accept-language': 'fr;q=1, es-MX;q=0.9, en;q=0.5' }),
      ),
    ).toBe('es')
    expect(
      of({ cookie: 'lang' }, request('/', { cookie: 'theme=dark; lang=es' })),
    ).toBe('es')
    expect(of({ query: 'lang' }, request('/?lang=es'))).toBe('es')
    expect(
      of(
        (r: Request) => r.headers.get('x-lang') ?? undefined,
        request('/', { 'x-lang': 'es' }),
      ),
    ).toBe('es')
  })

  test('a list tries each way in order', () => {
    const router = boat({
      languages: ['en', 'es'],
      langFrom: ['prefix', { cookie: 'lang' }, 'header'],
    })
    expect(router.langOf(request('/es/x', { cookie: 'lang=en' }))).toBe('es')
    expect(
      router.langOf(
        request('/x', { cookie: 'lang=en', 'accept-language': 'es' }),
      ),
    ).toBe('en')
    expect(router.langOf(request('/x', { 'accept-language': 'es' }))).toBe('es')
    expect(router.langOf(request('/x'))).toBeUndefined()
  })

  test('two languages may share a path when langFrom tells them apart', () => {
    const router = boat({ languages: ['en', 'es'], langFrom: 'subdomain' })
    router.get('arcade', { en: '/arcade', es: '/arcade' }, ok)
    expect(router.match('GET', '/arcade', 'es')?.route.lang).toBe('es')
    expect(router.match('GET', '/arcade', 'en')?.route.lang).toBe('en')
    // No language known: the default one answers.
    expect(router.match('GET', '/arcade')?.route.lang).toBe('en')
  })

  test('without langFrom, a shared path is still a clash, with a hint', () => {
    const router = boat({ languages: ['en', 'es'] })
    expect(() =>
      router.get('arcade', { en: '/arcade', es: '/arcade' }, ok),
    ).toThrow("tell them apart with a langFrom that doesn't read the path")
  })
  test('language tags and cookie values are read case-insensitively, quotes allowed', () => {
    const router = boat({ languages: ['en', 'es'], langFrom: ['header'] })
    expect(
      router.langOf(
        new Request('http://x/', { headers: { 'accept-language': 'ES-mx' } }),
      ),
    ).toBe('es')
    const byCookie = boat({
      languages: ['en', 'es'],
      langFrom: { cookie: 'lang' },
    })
    expect(
      byCookie.langOf(
        new Request('http://x/', { headers: { cookie: 'lang="ES"' } }),
      ),
    ).toBe('es')
  })
  test('a misspelled or empty langFrom fails with a clear message', () => {
    expect(() =>
      boat({ languages: ['en'], langFrom: 'cookies' as any }),
    ).toThrow('unknown langFrom "cookies"')
    expect(() => boat({ languages: [], langFrom: 'prefix' })).toThrow(
      'langFrom needs the languages to look for',
    )
  })

  test('alternates of a shared path point at each language through the URL', () => {
    const bySubdomain = boat({ languages: ['en', 'es'], langFrom: 'subdomain' })
    bySubdomain.get('arcade', { en: '/arcade', es: '/arcade' }, ok)
    expect(
      bySubdomain.alternates({
        url: new URL('http://es.museum.test/arcade'),
        lang: 'es',
      }),
    ).toEqual({
      en: 'http://en.museum.test/arcade',
      es: 'http://es.museum.test/arcade',
    })

    const byQuery = boat({
      languages: ['en', 'es'],
      langFrom: { query: 'lang' },
    })
    byQuery.get('arcade', { en: '/arcade', es: '/arcade' }, ok)
    expect(
      byQuery.alternates({ url: new URL('http://x/arcade?lang=es') }),
    ).toEqual({
      en: '/arcade?lang=en',
      es: '/arcade?lang=es',
    })

    const byCookie = boat({
      languages: ['en', 'es'],
      langFrom: { cookie: 'lang' },
    })
    byCookie.get('arcade', { en: '/arcade', es: '/arcade' }, ok)
    expect(byCookie.alternates({ url: new URL('http://x/arcade') })).toEqual({})
  })
})

describe('languages, more cases', () => {
  test('ctx.link in a route falls back to the default language', async () => {
    const router = boat({ languages: ['en', 'es'] })
    router.get('console', { en: '/en/console/:id', es: '/es/consola/:id' }, ok)
    router.get('/', (ctx) => new Response(ctx.link('console', { id: 'nes' })))
    const found = router.match('GET', '/')!
    const response = await found.route.handler({
      request: new Request('http://x/'),
      url: new URL('http://x/'),
      params: {},
      link: router.href as Context['link'],
    })
    expect(await response.text()).toBe('/en/console/nes')
  })

  test('alternates skip a language whose path needs a param this URL lacks', () => {
    const router = boat({ languages: ['en', 'es'] })
    router.get('c', { en: '/en/console/:slug', es: '/es/consola/:id' }, ok)
    expect(
      router.alternates({ url: new URL('http://x/en/console/nes') }),
    ).toEqual({
      en: '/en/console/nes',
    })
  })

  test('an empty segment is no value for a param', () => {
    const router = boat().get('/consolas/:id/info', ok)
    expect(router.match('GET', '/consolas//info')).toBeNull()
  })

  test('a failed registration leaves nothing behind', () => {
    const router = boat({ languages: ['en', 'es'] })
    router.get('/b', ok)
    expect(() => router.get('x', { en: '/a', es: '/b' }, ok)).toThrow(
      'match exactly the same URLs',
    )
    expect(router.routes.map((r) => r.pattern.path)).toEqual(['/b'])
    expect(() => router.href('x', {}, 'en')).toThrow('no route named "x"')
  })
})
