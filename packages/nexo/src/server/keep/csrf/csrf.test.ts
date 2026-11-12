import { describe, expect, test } from 'bun:test'
import { boat } from '../../../shared/boat'
import { keep, type KeepOptions } from '../keep'
import { FIELD, HEADER, PLAIN_COOKIE, SECURE_COOKIE } from './vocabulary'

/** A server that tells what came through: the method and the token of its context. */
function server(options: Omit<KeepOptions, 'router'> = {}) {
  const router = boat()
    .get('/', (ctx) => new Response(`token ${ctx.csrf?.token ?? 'none'}`))
    .post('/order', () => new Response('ordered'))
    .post('/api/orders', () => new Response('api'))
    .post('/go', () => Response.redirect('http://museo.test/', 303))
  return keep({ router, ...options })
}

const post = (
  s: ReturnType<typeof server>,
  path: string,
  headers: Record<string, string> = {},
  body?: BodyInit,
) =>
  s.fetch(
    new Request(`https://museo.test${path}`, { method: 'POST', headers, body }),
  )

const text = async (response: Response) =>
  `${response.status} ${await response.text()}`

describe('csrf: where a request comes from', () => {
  test('a safe method is never judged', async () => {
    const s = server({ csrf: { strict: true } })
    const r = await s.fetch(new Request('https://museo.test/'))
    expect(r.status).toBe(200)
  })

  test("the browser's Sec-Fetch-Site decides first", async () => {
    const s = server()
    expect(
      await text(await post(s, '/order', { 'sec-fetch-site': 'same-origin' })),
    ).toBe('200 ordered')
    expect(
      await text(await post(s, '/order', { 'sec-fetch-site': 'none' })),
    ).toBe('200 ordered')
    const cross = await post(s, '/order', {
      'sec-fetch-site': 'cross-site',
      origin: 'https://evil.test',
    })
    expect(cross.status).toBe(403)
    expect(await cross.text()).toBe(
      'csrf: this request did not come from this site',
    )
    const sibling = await post(s, '/order', {
      'sec-fetch-site': 'same-site',
      origin: 'https://blog.museo.test',
    })
    expect(sibling.status).toBe(403)
  })

  test('another site is fine when its origin is trusted', async () => {
    const s = server({ csrf: { trusted: ['https://admin.museo.test/'] } })
    const headers = {
      'sec-fetch-site': 'cross-site',
      origin: 'https://admin.museo.test',
    }
    expect((await post(s, '/order', headers)).status).toBe(200)
    expect(
      (await post(s, '/order', { origin: 'https://admin.museo.test' })).status,
    ).toBe(200)
  })

  test('without Fetch Metadata, the Origin header decides', async () => {
    const s = server()
    expect(
      (await post(s, '/order', { origin: 'https://museo.test' })).status,
    ).toBe(200)
    expect(
      (await post(s, '/order', { origin: 'https://evil.test' })).status,
    ).toBe(403)
    expect((await post(s, '/order', { origin: 'null' })).status).toBe(403)
  })

  test('behind a TLS proxy the same host is here: Origin https, request http', async () => {
    const s = server()
    const behind = (origin: string) =>
      s.fetch(
        new Request('http://museo.test/order', {
          method: 'POST',
          headers: { origin },
        }),
      )
    expect((await behind('https://museo.test')).status).toBe(200)
    expect((await behind('https://evil.test')).status).toBe(403)
    expect((await behind('https://museo.test:8443')).status).toBe(403) // another port is another host
  })

  test('never the other way: an http page posting to the https site is outside', async () => {
    const s = server()
    const r = await s.fetch(
      new Request('https://museo.test/order', {
        method: 'POST',
        headers: { origin: 'http://museo.test' },
      }),
    )
    expect(r.status).toBe(403)
  })

  test('nobody speaking passes by default, and is refused when strict', async () => {
    expect((await post(server(), '/order')).status).toBe(200)
    expect(
      (await post(server({ csrf: { strict: true } }), '/order')).status,
    ).toBe(403)
  })

  test('a trusted origin that is not a URL is a setup mistake', () => {
    expect(() => server({ csrf: { trusted: ['museo'] } })).toThrow(
      'csrf: trusted origin "museo" is not a URL',
    )
  })
})

describe('csrf: the token', () => {
  test('a first visit gets a token in the context and the same one in a cookie', async () => {
    const s = server()
    const r = await s.fetch(new Request('https://museo.test/'))
    const token = (await r.text()).slice('token '.length)
    expect(token).toMatch(/^[0-9a-f]{32}$/)
    expect(r.headers.get('set-cookie')).toBe(
      `${SECURE_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Secure`,
    )
  })

  test('a visit with the cookie keeps its token and gets no new cookie', async () => {
    const s = server()
    const r = await s.fetch(
      new Request('https://museo.test/', {
        headers: { cookie: `a=1; ${SECURE_COOKIE}=abc` },
      }),
    )
    expect(await r.text()).toBe('token abc')
    expect(r.headers.get('set-cookie')).toBeNull()
  })

  test('over plain HTTP away from localhost, a plain cookie carries it', async () => {
    const s = server()
    const lan = await s.fetch(new Request('http://192.168.1.5:3000/'))
    expect(lan.headers.get('set-cookie')).toMatch(
      new RegExp(
        `^${PLAIN_COOKIE}=[0-9a-f]{32}; Path=/; HttpOnly; SameSite=Lax$`,
      ),
    )
    const local = await s.fetch(new Request('http://localhost:3000/'))
    expect(local.headers.get('set-cookie')).toStartWith(`${SECURE_COOKIE}=`)
  })

  test('the token in the form field, matching the cookie, vouches when nothing else does', async () => {
    const s = server({ csrf: { strict: true } })
    const cookie = `${SECURE_COOKIE}=abc`
    const form = (token: string) =>
      new URLSearchParams({ n: '1', [FIELD]: token })
    const type = { 'content-type': 'application/x-www-form-urlencoded' }
    expect(
      (await post(s, '/order', { cookie, ...type }, form('abc'))).status,
    ).toBe(200)
    expect(
      (await post(s, '/order', { cookie, ...type }, form('xyz'))).status,
    ).toBe(403)
    expect(
      (
        await post(
          s,
          '/order',
          { cookie, ...type },
          new URLSearchParams({ n: '1' }),
        )
      ).status,
    ).toBe(403)
  })

  test('the token in the header vouches too, and the body stays whole for the handler', async () => {
    const router = boat().post(
      '/echo',
      async (ctx) => new Response(await ctx.request.text()),
    )
    const s = keep({ router, csrf: { strict: true } })
    const r = await s.fetch(
      new Request('https://museo.test/echo', {
        method: 'POST',
        headers: {
          cookie: `${SECURE_COOKIE}=abc`,
          [HEADER]: 'abc',
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: 'n=1',
      }),
    )
    expect(await text(r)).toBe('200 n=1')
  })

  test('a wrong token is outside even when the browser said nothing', async () => {
    const s = server()
    const r = await post(s, '/order', {
      cookie: `${SECURE_COOKIE}=abc`,
      [HEADER]: 'nope',
    })
    expect(r.status).toBe(403)
  })

  test('a redirect gets the cookie too, though its headers were sealed', async () => {
    const r = await post(server(), '/go', { origin: 'https://museo.test' })
    expect(r.status).toBe(303)
    expect(r.headers.get('set-cookie')).toStartWith(`${SECURE_COOKIE}=`)
  })
})

describe('csrf: the knobs', () => {
  test('except: a path as written, or a prefix ending in /', async () => {
    const s = server({ csrf: { except: ['/api/', '/go'] } })
    const cross = {
      'sec-fetch-site': 'cross-site',
      origin: 'https://evil.test',
    }
    expect((await post(s, '/api/orders', cross)).status).toBe(200)
    expect((await post(s, '/go', cross)).status).toBe(303)
    expect((await post(s, '/order', cross)).status).toBe(403)
  })

  test('off: no judgement, no token, no cookie', async () => {
    const s = server({ csrf: false })
    const cross = {
      'sec-fetch-site': 'cross-site',
      origin: 'https://evil.test',
    }
    expect((await post(s, '/order', cross)).status).toBe(200)
    const r = await s.fetch(new Request('https://museo.test/'))
    expect(await r.text()).toBe('token none')
    expect(r.headers.get('set-cookie')).toBeNull()
  })
})
