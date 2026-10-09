import { describe, expect, test } from 'bun:test'
import { boat } from '../../shared/boat'
import { keep } from '../keep'
import { bridge, CLIENT_PATH } from './bridge'

const server = keep({
  router: boat().get('/', () => new Response('home')),
}).use(bridge())

const get = (path: string, init?: RequestInit) =>
  server.fetch(new Request(`http://museo.test${path}`, init))

describe('bridge()', () => {
  test('serves the client script as a JavaScript module', async () => {
    const response = await get(CLIENT_PATH)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe(
      'text/javascript; charset=utf-8',
    )
    const text = await response.text()
    expect(text).toContain('addEventListener("click"')
    expect(text).not.toContain(': string') // types are gone
  })

  test('answers 304 to the ETag it gave', async () => {
    const first = await get(CLIENT_PATH)
    const etag = first.headers.get('etag')!
    expect(etag).toMatch(/^"[0-9a-f]{32}"$/)
    const again = await get(CLIENT_PATH, { headers: { 'if-none-match': etag } })
    expect(again.status).toBe(304)
    expect(again.headers.get('etag')).toBe(etag)
  })

  test('lets every other request through', async () => {
    expect(await (await get('/')).text()).toBe('home')
    expect((await get('/_nexo/other.js')).status).toBe(404)
  })
})
