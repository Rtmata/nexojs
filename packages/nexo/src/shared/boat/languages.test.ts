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
