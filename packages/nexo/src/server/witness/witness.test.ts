import { describe, expect, spyOn, test } from 'bun:test'
import { boat } from '../../shared/boat'
import { keep } from '../keep'
import { RELOAD_PATH, witness } from './witness'

const html = (body: BodyInit | null, init: ResponseInit = {}) =>
  new Response(body, {
    ...init,
    headers: { 'content-type': 'text/html; charset=utf-8', ...init.headers },
  })

const serverWith = (router = boat()) => keep({ router }).use(witness())

const page = (answer: () => Response) => serverWith(boat().get('/', answer))

const get = (
  server: ReturnType<typeof serverWith>,
  path: string,
  init?: RequestInit,
) => server.fetch(new Request(`http://museo.test${path}`, init))

const textOf = async (response: Response) => response.text()

describe('the script in pages', () => {
  test('follows HTML pages', async () => {
    const text = await textOf(
      await get(
        page(() => html('<body><h1>Museo</h1></body>')),
        '/',
      ),
    )
    expect(text).toStartWith('<body><h1>Museo</h1></body><script>')
    expect(text).toContain(`new EventSource('${RELOAD_PATH}')`)
  })

  test('carries the id of the process that made the page', async () => {
    const text = await textOf(
      await get(
        page(() => html('<body></body>')),
        '/',
      ),
    )
    expect(text).toMatch(/const boot = '[\w-]+'/)
  })

  test('also goes into error pages, returned or thrown', async () => {
    const lost = boat().notFound(() => html('<p>perdido</p>', { status: 404 }))
    const response = await get(serverWith(lost), '/nada')
    expect(response.status).toBe(404)
    expect(await response.text()).toContain('EventSource')
    const thrown = page(() => {
      throw html('<p>403</p>', { status: 403 })
    })
    expect(await textOf(await get(thrown, '/'))).toContain('EventSource')
  })

  test('only goes into documents, not fragments or iframes', async () => {
    const server = page(() => html('<li>x</li>'))
    const fragment = { headers: { 'sec-fetch-dest': 'empty' } }
    expect(await textOf(await get(server, '/', fragment))).toBe('<li>x</li>')
  })

  test('leaves alone what it cannot safely rewrite', async () => {
    const cases: [BodyInit | null, ResponseInit][] = [
      [null, { status: 304 }],
      ['x', { headers: { 'content-encoding': 'gzip' } }],
    ]
    for (const [body, init] of cases) {
      const text = await textOf(
        await get(
          page(() => html(body, init)),
          '/',
        ),
      )
      expect(text).not.toContain('EventSource')
    }
    const json = page(() => Response.json({ ok: true }))
    expect(await (await get(json, '/')).json()).toEqual({ ok: true })
  })

  test('the rewritten page keeps its type, drops stale headers and is never cached', async () => {
    const response = await get(
      page(
        () =>
          new Response('<body></body>', {
            headers: { 'Content-Type': 'Text/HTML', etag: '"1"' },
          }),
      ),
      '/',
    )
    expect(response.headers.get('content-type')).toBe('Text/HTML')
    expect(response.headers.get('etag')).toBeNull()
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
})

describe('the page streams through', () => {
  test('byte for byte, with the script after it', async () => {
    const latin1 = new Uint8Array([
      0x3c, 0x70, 0x3e, 0xe9, 0x3c, 0x2f, 0x70, 0x3e,
    ]) // <p>é</p>
    const server = page(() =>
      html(latin1, {
        headers: { 'content-type': 'text/html; charset=iso-8859-1' },
      }),
    )
    const bytes = new Uint8Array(await (await get(server, '/')).arrayBuffer())
    expect([...bytes.slice(0, 8)]).toEqual([...latin1])
    expect(new TextDecoder().decode(bytes.slice(8))).toStartWith('<script>')
  })

  test('parts, downloads and UTF-16 are left alone', async () => {
    const cases: ResponseInit[] = [
      { status: 206 },
      { headers: { 'content-disposition': 'attachment; filename=x.html' } },
      { headers: { 'content-type': 'text/html; charset=utf-16' } },
    ]
    for (const init of cases) {
      expect(
        await textOf(
          await get(
            page(() => html('x', init)),
            '/',
          ),
        ),
      ).toBe('x')
    }
  })

  test('the script runs once per window', async () => {
    const text = await textOf(
      await get(
        page(() => html('<body></body>')),
        '/',
      ),
    )
    expect(text).toContain('if (window.__witness) return')
  })
})

describe('the hello stream', () => {
  test('streams a hello with this process id', async () => {
    const response = await get(serverWith(), RELOAD_PATH)
    expect(response.headers.get('content-type')).toBe('text/event-stream')
    const reader = response.body!.getReader()
    const { value } = await reader.read()
    await reader.cancel()
    expect(new TextDecoder().decode(value)).toMatch(
      /^retry: 250\nevent: hello\ndata: [\w-]+\n\n$/,
    )
  })

  test('every witness() in the process says the same id', async () => {
    const hello = async () => {
      const reader = (await get(serverWith(), RELOAD_PATH)).body!.getReader()
      const { value } = await reader.read()
      await reader.cancel()
      return new TextDecoder().decode(value)
    }
    expect(await hello()).toBe(await hello())
  })

  test('a HEAD stops the heartbeat it never needed', async () => {
    const cleared = spyOn(globalThis, 'clearInterval')
    await get(serverWith(), RELOAD_PATH, { method: 'HEAD' })
    expect(cleared).toHaveBeenCalled()
    cleared.mockRestore()
  })
})
