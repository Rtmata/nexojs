import { describe, expect, test } from 'bun:test'
import { redirect } from './redirect'
import { route } from './route'
import { boat } from './router'
import type { Context } from './types'

async function visit(router: ReturnType<typeof boat<any>>, path: string) {
  const url = new URL(path, 'http://x')
  const found = router.match('GET', url.pathname)!
  const ctx: Context = {
    request: new Request(url),
    url,
    params: found.params,
    link: router.href,
  }
  return found.route.handler(ctx)
}

describe('redirect()', () => {
  test('is a plain Response with a location, 302 by default', () => {
    const response = redirect('/en')
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/en')
    expect(redirect('/en', 301).status).toBe(301)
  })

  test('works from a loader', async () => {
    const router = boat()
    router.get('/old/:id', {
      load: (ctx) => redirect(`/new/${ctx.params.id}`),
      page: () => new Response('never'),
    })
    expect((await visit(router, '/old/7')).headers.get('location')).toBe(
      '/new/7',
    )
  })
})

describe('router.redirect()', () => {
  test('declares a fixed move, 301 by default, and the router knows it', async () => {
    const router = boat().redirect('/', '/en')
    expect(router.routes[0]?.redirect).toEqual({ status: 301, to: '/en' })
    const response = await visit(router, '/')
    expect(response.status).toBe(301)
    expect(response.headers.get('location')).toBe('/en')
  })

  test('carries params to a route target, per language', async () => {
    const consoleRoute = route('console', {
      en: '/en/console/:id',
      es: '/es/consola/:id',
    })
    const router = boat({ languages: ['en', 'es'] })
    router.get(consoleRoute, () => new Response('console'))
    router.redirect(
      'old-console',
      { en: '/en/consoles/:id', es: '/es/consolas/:id' },
      consoleRoute,
      308,
    )

    const response = await visit(router, '/es/consolas/nes')
    expect(response.status).toBe(308)
    expect(response.headers.get('location')).toBe('/es/consola/nes')
  })

  test('accepts a route name as target', async () => {
    const router = boat()
    router.get('home', '/home', () => new Response('home'))
    router.redirect('/start', 'home', 302)
    expect((await visit(router, '/start')).headers.get('location')).toBe(
      '/home',
    )
  })
  test('accepts a function of the request as target', async () => {
    const router = boat()
    router.redirect('/old/:id', (ctx) => `/new/${Number(ctx.params.id) + 1}`)
    expect((await visit(router, '/old/41')).headers.get('location')).toBe(
      '/new/42',
    )
  })
  test('from a path without languages to a per-language route: the request language, else the default', async () => {
    const consoleRoute = route('console', {
      en: '/en/console/:id',
      es: '/es/consola/:id',
    })
    const router = boat({
      languages: ['en', 'es'],
      langFrom: { cookie: 'lang' },
    })
    router.get(consoleRoute, () => new Response('console'))
    router.redirect('/consolas/:id', consoleRoute)

    const found = router.match('GET', '/consolas/nes')!
    const call = (lang?: string) =>
      found.route.handler({
        request: new Request('http://x/consolas/nes'),
        url: new URL('http://x/consolas/nes'),
        params: found.params,
        lang,
        link: router.href as Context['link'],
      })
    expect((await call('es')).headers.get('location')).toBe('/es/consola/nes')
    expect((await call()).headers.get('location')).toBe('/en/console/nes')
  })

  test('absolute URLs are used as they are; fixed paths get their params filled', async () => {
    const router = boat()
    router.redirect('/old', 'https://museum.example/new')
    router.redirect('/old/:id/:x', '/new/:id')
    expect((await visit(router, '/old')).headers.get('location')).toBe(
      'https://museum.example/new',
    )
    expect((await visit(router, '/old/7/z')).headers.get('location')).toBe(
      '/new/7',
    )
  })
  test('a bare name without paths per language is rejected right away', () => {
    expect(() => (boat() as any).redirect('old', '/new')).toThrow(
      'needs a path starting with "/", a route(), or a name followed by its paths',
    )
    expect(() => (boat() as any).redirect('/old')).toThrow(
      'needs somewhere to go',
    )
  })

  test('a target param the source does not capture fails at registration', () => {
    expect(() => boat().redirect('/old', '/new/:id')).toThrow(
      'needs ":id", which "/old" doesn\'t capture',
    )
    const consoleRoute = route('console', '/console/:id')
    expect(() => boat().redirect('/old', consoleRoute)).toThrow('needs ":id"')
  })

  test('a route name registered later is checked when it arrives', () => {
    const router = boat()
    router.redirect('/old', 'console')
    expect(() =>
      router.get('console', '/console/:id', () => new Response()),
    ).toThrow('needs ":id"')
  })

  test('extra source params are left out of a route target', async () => {
    const consoleRoute = route('console', '/console/:id')
    const router = boat()
    router.get(consoleRoute, () => new Response('console'))
    router.redirect('/old/:id/:page', consoleRoute)
    expect((await visit(router, '/old/nes/2')).headers.get('location')).toBe(
      '/console/nes',
    )
  })

  test('a route name with a colon is a name, not an absolute URL', async () => {
    const router = boat()
    router.get('museum:home', '/home', () => new Response('home'))
    router.redirect('/start', 'museum:home')
    expect((await visit(router, '/start')).headers.get('location')).toBe(
      '/home',
    )
  })
  test('the router records where a redirect goes', () => {
    const router = boat().redirect('/old/:id', '/new/:id', 308)
    expect(router.routes[0]?.redirect).toEqual({ status: 308, to: '/new/:id' })
  })

  test('a per-language redirect can exist in some languages only', async () => {
    const router = boat({ languages: ['en', 'es'] })
    router.get('home', { en: '/en', es: '/es' }, () => new Response('home'))
    router.redirect('old-press', { es: '/es/prensa' }, 'home', {
      status: 302,
      only: ['es'],
    })
    const response = await visit(router, '/es/prensa')
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/es')
  })

  test('a per-language source needs its target in the same languages', () => {
    const press = route('press', { es: '/es/prensa' })
    const router = boat({ languages: ['en', 'es'] })
    expect(() =>
      router.redirect('old', { en: '/en/old', es: '/es/old' }, press),
    ).toThrow('"press" has no "en" version')
  })

  test('a source without languages falls back to a language the target has', async () => {
    const press = route('press', { es: '/es/prensa' })
    const router = boat({ languages: ['en', 'es'] })
    router.get(press, () => new Response('press'), { only: ['es'] })
    router.redirect('/prensa', press)
    expect((await visit(router, '/prensa')).headers.get('location')).toBe(
      '/es/prensa',
    )
  })

  test('check() reports redirects to names that never arrived', () => {
    const router = boat()
    router.redirect('/old', 'nowhere')
    expect(() => router.check()).toThrow(
      'goes to "nowhere", but no GET route has that name',
    )
    router.get('nowhere', '/here', () => new Response())
    expect(() => router.check()).not.toThrow()
  })

  test('query and hash stay on a target with params', async () => {
    const router = boat()
    router.redirect('/old/:id', '/new/:id?from=old#top')
    expect((await visit(router, '/old/7')).headers.get('location')).toBe(
      '/new/7?from=old#top',
    )
  })
})

describe('router.redirect() targets and sources', () => {
  test('an empty wildcard carries over', async () => {
    const router = boat().redirect('/old/*', '/new/*')
    expect((await visit(router, '/old')).headers.get('location')).toBe('/new')
  })

  test('only is refused on a plain path; null options mean the defaults', async () => {
    expect(() =>
      (boat() as any).redirect('/old', '/en', { only: ['en'] }),
    ).toThrow('{ only } is for routes declared per language')
    const router = (boat() as any).redirect('/a', '/b', null)
    expect((await visit(router, '/a')).status).toBe(301)
  })

  test('mailto: and tel: are locations, not route names', async () => {
    const router = boat().redirect('/contact', 'mailto:hi@museum.example')
    expect(() => router.check()).not.toThrow()
    expect((await visit(router, '/contact')).headers.get('location')).toBe(
      'mailto:hi@museum.example',
    )
  })
})
