import { afterAll, beforeAll, describe, expect, spyOn, test } from 'bun:test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
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
