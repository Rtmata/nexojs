import { afterAll, beforeAll, describe, expect, spyOn, test } from 'bun:test'
import {
  mkdtemp,
  mkdir,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { boat } from '../../shared/boat'
import { files } from './files'
import { keep } from './keep'

let folder: string

beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), 'keep-'))
  await mkdir(join(folder, 'img'))
  await writeFile(join(folder, 'logo.svg'), '<svg/>')
  await writeFile(join(folder, 'img', 'nes.png'), 'png')
  await writeFile(join(folder, 'consolas'), 'shadowed')
})

afterAll(() => rm(folder, { recursive: true }))

const get = (
  server: { fetch(r: Request): Promise<Response> },
  path: string,
  init?: RequestInit,
) => server.fetch(new Request(`http://museo.test${path}`, init))

describe('keep', () => {
  test('an error page gets the language of the route that failed', async () => {
    const errors = spyOn(console, 'error').mockImplementation(() => {})
    const router = boat({ languages: ['en', 'es'] })
    router.get('home', { en: '/en', es: '/es' }, () => new Response('home'))
    router.get('boom', { en: '/en/boom', es: '/es/boom' }, () => {
      throw new Error('boom')
    })
    router.onError(
      (ctx) => new Response(`${ctx.lang} ${ctx.link('home')}`, { status: 500 }),
    )
    router.notFound((ctx) => new Response(ctx.link('home'), { status: 404 }))
    const server = keep({ router })
    expect(await (await get(server, '/es/boom')).text()).toBe('es /es')
    // No language known (no langFrom): links use the default one.
    expect(await (await get(server, '/es/nada')).text()).toBe('/en')
    errors.mockRestore()
  })

  test('a Response thrown by a middleware or hook is still the answer', async () => {
    const errors = spyOn(console, 'error').mockImplementation(() => {})
    const router = boat().get('/', () => new Response('page'))
    const server = keep({ router }).use({
      onRequest: () => {
        throw new Response('denied', { status: 401 })
      },
    })
    const response = await get(server, '/')
    expect(response.status).toBe(401)
    expect(await response.text()).toBe('denied')
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
  })

  test('a router class keeps its this when keep asks it for ctx.link', async () => {
    class Tiny {
      paths: Record<string, string> = { home: '/home' }
      match() {
        return {
          route: { handler: (ctx: any) => new Response(ctx.link('home')) },
          params: {},
        }
      }
      allowed() {
        return []
      }
      notFoundHandler = () => new Response('nope', { status: 404 })
      errorHandler = () => new Response('oops', { status: 500 })
      linkFor() {
        return (name: string) => this.paths[name]!
      }
    }
    expect(
      await (await get(keep({ router: new Tiny() as any }), '/')).text(),
    ).toBe('/home')
  })

  test('HEAD is listed once in Allow', async () => {
    const tiny = {
      match: () => null,
      allowed: () => ['GET', 'HEAD'],
      notFoundHandler: () => new Response('nope', { status: 404 }),
      errorHandler: () => new Response('oops', { status: 500 }),
    }
    const response = await get(keep({ router: tiny }), '/', { method: 'POST' })
    expect(response.headers.get('allow')).toBe('GET, HEAD')
  })

  test('listen() reports files hidden by a mount at a longer path', async () => {
    await mkdir(join(folder, 'covers'), { recursive: true })
    await writeFile(join(folder, 'covers', 'nes.png'), 'hidden')
    const warn = spyOn(console, 'warn').mockImplementation(() => {})
    const log = spyOn(console, 'log').mockImplementation(() => {})
    const server = keep({
      router: boat(),
      static: [folder, { dir: join(folder, 'img'), at: '/covers' }],
    })
    await server.listen(0)
    await server.stop()
    expect(warn.mock.calls.flat().join('\n')).toContain(
      `static: ${join(folder, 'img')} at /covers`,
    )
    warn.mockRestore()
    log.mockRestore()
  })

  test('listen() refuses a router whose setup cannot work', async () => {
    const router = boat()
    router.redirect('/old', 'nowhere')
    await expect(keep({ router }).listen(0)).rejects.toThrow(
      'no GET route has that name',
    )
  })

  test('an encoded slash never reaches a static file', async () => {
    const router = boat()
    const server = keep({ router, static: folder })
    expect((await get(server, '/img%2Fnes.png')).status).toBe(404)
    expect(await (await get(server, '/img/nes.png')).text()).toBe('png')
  })

  test('with a function as router, static files are served first', async () => {
    const server = keep({ router: () => new Response('fn'), static: folder })
    expect(await (await get(server, '/logo.svg')).text()).toBe('<svg/>')
    expect(await (await get(server, '/anything')).text()).toBe('fn')
  })

  test('a language rule that throws does not take the request down', async () => {
    const errors = spyOn(console, 'error').mockImplementation(() => {})
    const router = boat({
      languages: ['en', 'es'],
      langFrom: () => {
        throw new Error('broken rule')
      },
    }).get('/', (ctx) => new Response(String(ctx.lang)))
    expect(await (await get(keep({ router }), '/')).text()).toBe('undefined')
    errors.mockRestore()
  })

  test('static takes several folders, each under its own path', async () => {
    const router = boat()
    const server = keep({
      router,
      static: [folder, { dir: join(folder, 'img'), at: '/covers' }],
    })
    expect(await (await get(server, '/logo.svg')).text()).toBe('<svg/>')
    expect(await (await get(server, '/covers/nes.png')).text()).toBe('png')
    expect((await get(server, '/covers/logo.svg')).status).toBe(404)
  })

  test('use() takes hooks as well as middlewares', async () => {
    const router = boat().get('/', () => new Response('page'))
    const server = keep({ router }).use({
      onResponse: (_ctx, response) => {
        response.headers.set('x-museum', 'yes')
        return response
      },
    })
    expect((await get(server, '/')).headers.get('x-museum')).toBe('yes')
  })

  test('the request language picks the route and reaches the 404', async () => {
    const router = boat({
      languages: ['en', 'es'],
      langFrom: { cookie: 'lang' },
    })
    router.get(
      'arcade',
      { en: '/arcade', es: '/arcade' },
      (ctx) => new Response(ctx.lang),
    )
    router.notFound((ctx) => new Response(`lost:${ctx.lang}`, { status: 404 }))
    const server = keep({ router })
    const as = (lang: string, path: string) =>
      get(server, path, { headers: { cookie: `lang=${lang}` } })

    expect(await (await as('es', '/arcade')).text()).toBe('es')
    expect(await (await as('en', '/arcade')).text()).toBe('en')
    expect(await (await as('es', '/nada')).text()).toBe('lost:es')
    expect(await (await get(server, '/arcade')).text()).toBe('en')
  })

  test('works without a router: one function answers everything', async () => {
    const server = keep({
      router: (request) => new Response(new URL(request.url).pathname),
    })
    expect(await (await get(server, '/any/path')).text()).toBe('/any/path')
    expect((await get(server, '/slash/')).status).toBe(301)
  })

  test('works with any router that has the members keep needs', async () => {
    const tiny = {
      match: (_method: string, pathname: string) =>
        pathname === '/hi'
          ? { route: { handler: () => new Response('hi') }, params: {} }
          : null,
      allowed: () => [],
      notFoundHandler: () => new Response('nope', { status: 404 }),
      errorHandler: () => new Response('oops', { status: 500 }),
    }
    expect(await (await get(keep({ router: tiny }), '/hi')).text()).toBe('hi')
    expect((await get(keep({ router: tiny }), '/x')).status).toBe(404)
  })

  test('ctx.link explains itself when the router cannot build links', async () => {
    const errors = spyOn(console, 'error').mockImplementation(() => {})
    const tiny = {
      match: () => ({
        route: { handler: (ctx: any) => new Response(ctx.link('home')) },
        params: {},
      }),
      allowed: () => [],
      notFoundHandler: () => new Response('nope', { status: 404 }),
      errorHandler: ({ error }: any) =>
        new Response(String(error), { status: 500 }),
    }
    const response = await get(keep({ router: tiny }), '/')
    expect(await response.text()).toContain(
      'needs a router that can build links',
    )
    errors.mockRestore()
  })

  test('a thrown Response is the answer, not an error', async () => {
    const router = boat()
    const findMachine = (id: string) => {
      if (id !== 'nes') throw new Response('lost', { status: 404 })
      return 'NES'
    }
    router.get('/consola/:id', {
      load: ({ params }) => findMachine(params.id),
      page: (name) => new Response(name),
    })
    const errors = spyOn(console, 'error').mockImplementation(() => {})

    expect(await (await get(keep({ router }), '/consola/nes')).text()).toBe(
      'NES',
    )
    const lost = await get(keep({ router }), '/consola/zx')
    expect(lost.status).toBe(404)
    expect(await lost.text()).toBe('lost')
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
  })

  test('the base context can build links to named routes', async () => {
    const router = boat()
    router.get('about', '/about', () => new Response('about'))
    router.notFound(({ link }) => new Response(link('about'), { status: 404 }))
    expect(await (await get(keep({ router }), '/nada')).text()).toBe('/about')
  })

  test('answers with the matching route and its params', async () => {
    const router = boat().get(
      '/consola/:id',
      ({ params }) => new Response(`consola ${params.id}`),
    )
    const response = await get(keep({ router }), '/consola/nes')

    expect(await response.text()).toBe('consola nes')
  })

  test('redirects a trailing slash, keeping the query', async () => {
    const response = await get(keep({ router: boat() }), '/consola/nes/?page=2')

    expect(response.status).toBe(301)
    expect(response.headers.get('location')).toBe(
      'http://museo.test/consola/nes?page=2',
    )
  })

  test('uses the default and the custom 404', async () => {
    const router = boat()
    expect((await get(keep({ router }), '/nada')).status).toBe(404)

    router.notFound(
      ({ url }) => new Response(`perdido: ${url.pathname}`, { status: 404 }),
    )
    expect(await (await get(keep({ router }), '/nada')).text()).toBe(
      'perdido: /nada',
    )
  })

  test('answers 405 with Allow when only other methods exist', async () => {
    const router = boat().get('/favoritos', () => new Response('list'))
    const response = await get(keep({ router }), '/favoritos', {
      method: 'POST',
    })

    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('GET, HEAD')
  })

  test('answers HEAD from the GET route, without a body', async () => {
    const router = boat().get(
      '/',
      () => new Response('home', { headers: { 'x-page': 'home' } }),
    )
    const response = await get(keep({ router }), '/', { method: 'HEAD' })

    expect(response.status).toBe(200)
    expect(response.headers.get('x-page')).toBe('home')
    expect(await response.text()).toBe('')
  })

  test('catches errors: default 500, then the custom one', async () => {
    const error = spyOn(console, 'error').mockImplementation(() => {})
    const router = boat().get('/rota', () => {
      throw new Error('boom')
    })

    const plain = await get(keep({ router }), '/rota')
    expect(plain.status).toBe(500)
    expect(await plain.text()).not.toContain('boom')

    router.onError(() => new Response('la sala se derrumbó', { status: 500 }))
    expect(await (await get(keep({ router }), '/rota')).text()).toBe(
      'la sala se derrumbó',
    )
    error.mockRestore()
  })

  test('runs middlewares around every request, including 404s', async () => {
    const seen: string[] = []
    const server = keep({ router: boat() }).use((handler) => async (ctx) => {
      seen.push(ctx.url.pathname)
      return handler(ctx)
    })
    await get(server, '/nada')

    expect(seen).toEqual(['/nada'])
  })
})

describe('static files', () => {
  test('serves the static folder when no route matches', async () => {
    const response = await get(
      keep({ router: boat(), static: folder }),
      '/img/nes.png',
    )

    expect(response.headers.get('content-type')).toBe('image/png')
    expect(await response.text()).toBe('png')
  })

  test('routes win over static files', async () => {
    const router = boat().get('/consolas', () => new Response('route'))
    const response = await get(keep({ router, static: folder }), '/consolas')

    expect(await response.text()).toBe('route')
  })

  test('never leaves the folder', async () => {
    const response = await get(
      keep({ router: boat(), static: join(folder, 'img') }),
      '/%2E%2E/logo.svg',
    )

    expect(response.status).toBe(404)
  })

  test('files() serves a folder on any wildcard route', async () => {
    const router = boat().get('/covers/*', files(join(folder, 'img')))
    const server = keep({ router })

    expect(await (await get(server, '/covers/nes.png')).text()).toBe('png')
    expect((await get(server, '/covers/zelda.png')).status).toBe(404)
  })

  test('warns at startup about files shadowed by a route', async () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {})
    const log = spyOn(console, 'log').mockImplementation(() => {})
    const router = boat().get('/consolas', () => new Response('route'))
    const server = await keep({ router, static: folder }).listen(0)
    await server.stop()

    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toContain(
      '/consolas  (route: GET /consolas)',
    )
    warn.mockRestore()
    log.mockRestore()
  })
})

describe('keep, edge cases', () => {
  test('a trailing slash keeps the method for anything but GET', async () => {
    const server = keep({ router: boat() })

    expect((await get(server, '/x/')).status).toBe(301)
    expect((await get(server, '/x/', { method: 'POST' })).status).toBe(308)
  })

  test('listening twice fails and leaves the first server running', async () => {
    const server = keep({ router: boat().get('/', () => new Response('ok')) })
    const log = spyOn(console, 'log').mockImplementation(() => {})
    await server.listen(0)
    try {
      await expect(server.listen(0)).rejects.toThrow('already listening')
    } finally {
      await server.stop()
      log.mockRestore()
    }
  })

  test('HEAD cancels the body it drops, so its cleanup runs', async () => {
    let cancelled = false
    const body = new ReadableStream({ cancel: () => void (cancelled = true) })
    const server = keep({ router: boat().get('/s', () => new Response(body)) })

    await get(server, '/s', { method: 'HEAD' })
    expect(cancelled).toBe(true)
  })
})

describe('serving safely while listening', () => {
  test('a file the index knows is still checked on disk', async () => {
    const site = await mkdtemp(join(tmpdir(), 'keep-site-'))
    await writeFile(join(site, 'a.png'), 'png')
    const server = keep({ router: boat(), static: site })
    const log = spyOn(console, 'log').mockImplementation(() => {})
    await server.listen(0)
    try {
      await unlink(join(site, 'a.png'))
      await symlink(join(folder, 'logo.svg'), join(site, 'a.png'))
      expect((await get(server, '/a.png')).status).toBe(404)
    } finally {
      await server.stop()
      log.mockRestore()
      await rm(site, { recursive: true })
    }
  })

  test('an empty segment is no file, with or without the index', async () => {
    const server = keep({ router: boat(), static: folder })
    expect((await get(server, '/img//nes.png')).status).toBe(404)
  })

  test('two listen() calls at once: the second fails', async () => {
    const server = keep({ router: boat() })
    const log = spyOn(console, 'log').mockImplementation(() => {})
    const first = server.listen(0)
    try {
      await expect(server.listen(0)).rejects.toThrow('already listening')
      await first
    } finally {
      await server.stop()
      log.mockRestore()
    }
  })

  test('stop() closes an endless stream after the grace period', async () => {
    const hello = new TextEncoder().encode('hello')
    const endless = () =>
      new Response(
        new ReadableStream({
          start: (controller) => controller.enqueue(hello),
          pull: () => new Promise(() => {}), // never more data
        }),
      )
    const server = keep({ router: boat().get('/sse', endless) })
    const log = spyOn(console, 'log').mockImplementation(() => {})
    await server.listen(0)
    const url = (server as any).running.url
    const open = await fetch(new URL('/sse', url))
    const started = Date.now()
    await server.stop({ grace: 100 })
    log.mockRestore()
    expect(open.status).toBe(200)
    expect(Date.now() - started).toBeLessThan(2000)
  })
})

describe('starting, stopping and options', () => {
  test('stop() during listen() waits for it, then stops it', async () => {
    const server = keep({ router: boat() })
    const log = spyOn(console, 'log').mockImplementation(() => {})
    const listening = server.listen(0)
    await server.stop()
    await listening
    expect((server as any).running).toBeNull()
    log.mockRestore()
  })

  test('a static option without at, or with a wrong dir, says what it takes', () => {
    expect(() =>
      keep({ router: boat(), static: { dir: './x' } as any }),
    ).toThrow("static takes a folder ('./public') or { dir, at }")
  })

  test('a file stored NFD is found from an NFC URL, without the index too', async () => {
    const nfd = 'Pokémon.png'.normalize('NFD')
    await writeFile(join(folder, nfd), 'png')
    const server = keep({ router: boat(), static: folder })
    const response = await get(
      server,
      '/' + encodeURIComponent('Pokémon.png'.normalize('NFC')),
    )
    expect(response.status).toBe(200)
  })
})
