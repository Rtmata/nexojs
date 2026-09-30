import { describe, expect, test } from 'bun:test'
import { boat } from '../../shared/boat'
import { keep } from '../keep'
import { inject, reload, RELOAD_PATH } from './reload'

const html = (body: string) =>
  new Response(body, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })

const serverWith = (router = boat()) => keep({ router }).use(reload())

const get = (server: ReturnType<typeof serverWith>, path: string) =>
  server.fetch(new Request(`http://museo.test${path}`))

describe('reload', () => {
  test('injects the script into HTML pages', async () => {
    const router = boat().get('/', () => html('<body><h1>Museo</h1></body>'))
    const page = await (await get(serverWith(router), '/')).text()

    expect(page).toContain(`new EventSource('${RELOAD_PATH}')`)
    expect(page.indexOf('<script>')).toBeLessThan(page.indexOf('</body>'))
  })

  test('also injects into HTML error pages, so fixing them reloads too', async () => {
    const router = boat().notFound(
      () =>
        new Response('<p>perdido</p>', {
          status: 404,
          headers: { 'content-type': 'text/html' },
        }),
    )
    const response = await get(serverWith(router), '/nada')

    expect(response.status).toBe(404)
    expect(await response.text()).toContain('EventSource')
  })

  test('leaves other content untouched', async () => {
    const router = boat().get('/data', () => Response.json({ ok: true }))

    expect(await (await get(serverWith(router), '/data')).json()).toEqual({
      ok: true,
    })
  })

  test('streams a hello event with this process id', async () => {
    const response = await get(serverWith(), RELOAD_PATH)
    expect(response.headers.get('content-type')).toBe('text/event-stream')

    const reader = response.body!.getReader()
    const { value } = await reader.read()
    await reader.cancel()

    expect(new TextDecoder().decode(value)).toMatch(
      /^retry: 250\nevent: hello\ndata: [\w-]+\n\n$/,
    )
  })

  test('each reload() has its own id', async () => {
    const first = async () => {
      const reader = (await get(serverWith(), RELOAD_PATH)).body!.getReader()
      const { value } = await reader.read()
      await reader.cancel()
      return new TextDecoder().decode(value)
    }

    expect(await first()).not.toBe(await first())
  })
})

describe('inject', () => {
  test('appends when there is no </body>', () => {
    expect(inject('<h1>hola</h1>')).toStartWith('<h1>hola</h1><script>')
  })
})
