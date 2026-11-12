import { describe, expect, spyOn, test } from 'bun:test'
import { boat, redirect } from '../../../shared/boat'
import { keep, type KeepOptions } from '../keep'
import { MemoryStore, type IdempotencyStore } from './store'
import { KEY_HEADER, REPLAYED_HEADER } from './vocabulary'

function server(options: Omit<KeepOptions, 'router'> = {}) {
  let orders = 0
  const router = boat()
    .post('/order', async (ctx) => {
      orders++
      return new Response(`order ${orders}: ${await ctx.request.text()}`)
    })
    .post('/go', () => redirect('/thanks', 303))
    .post('/boom', () => {
      throw new Error('boom')
    })
    .post('/huge', () => new Response('x'.repeat(1_000_001)))
    .get('/order', () => new Response('list'))
  const s = keep({ router, csrf: false, ...options })
  return { s, orders: () => orders }
}

const post = (
  s: { fetch(r: Request): Promise<Response> },
  path: string,
  key: string | null,
  body = 'n=1',
) =>
  s.fetch(
    new Request(`https://museo.test${path}`, {
      method: 'POST',
      headers: key ? { [KEY_HEADER]: key } : {},
      body,
    }),
  )

describe('idempotency', () => {
  test('the same key again gets the first answer, and the handler ran once', async () => {
    const { s, orders } = server()
    const first = await post(s, '/order', 'k1')
    expect(await first.text()).toBe('order 1: n=1')
    expect(first.headers.get(REPLAYED_HEADER)).toBeNull()
    const again = await post(s, '/order', 'k1')
    expect(again.status).toBe(200)
    expect(await again.text()).toBe('order 1: n=1')
    expect(again.headers.get(REPLAYED_HEADER)).toBe('true')
    expect(orders()).toBe(1)
  })

  test('false turns it off, as csrf and securityHeaders', async () => {
    const { s, orders } = server({ idempotency: false })
    await post(s, '/order', 'k1')
    const again = await post(s, '/order', 'k1')
    expect(again.headers.get(REPLAYED_HEADER)).toBeNull()
    expect(orders()).toBe(2)
  })

  test('another key, or no key, is another order', async () => {
    const { s, orders } = server()
    await post(s, '/order', 'k1')
    await post(s, '/order', 'k2')
    await post(s, '/order', null)
    await post(s, '/order', null)
    expect(orders()).toBe(4)
  })

  test('the same key with another request is refused', async () => {
    const { s } = server()
    await post(s, '/order', 'k1', 'n=1')
    const other = await post(s, '/order', 'k1', 'n=2')
    expect(other.status).toBe(422)
    expect(await other.text()).toBe(
      'idempotency: this Idempotency-Key was already used for another request',
    )
  })

  test('the same key while the first is still being answered is refused', async () => {
    let release!: () => void
    const held = new Promise<void>((r) => (release = r))
    const router = boat().post('/slow', async () => {
      await held
      return new Response('done')
    })
    const s = keep({ router, csrf: false })
    const first = post(s, '/slow', 'k1')
    await new Promise((r) => setTimeout(r, 20))
    const second = await post(s, '/slow', 'k1')
    expect(second.status).toBe(409)
    release()
    expect(await (await first).text()).toBe('done')
    expect(await (await post(s, '/slow', 'k1')).text()).toBe('done')
  })

  test('a redirect is replayed as a redirect', async () => {
    const { s } = server()
    await post(s, '/go', 'k1')
    const again = await post(s, '/go', 'k1')
    expect(again.status).toBe(303)
    expect(again.headers.get('location')).toBe('/thanks')
  })

  test('a recording expires', async () => {
    let clock = 0
    const store = new MemoryStore(() => clock)
    const { s, orders } = server({ idempotency: { ttl: 60_000, store } })
    await post(s, '/order', 'k1')
    clock = 59_000
    await post(s, '/order', 'k1')
    expect(orders()).toBe(1)
    clock = 60_000
    await post(s, '/order', 'k1')
    expect(orders()).toBe(2)
  })

  test('a server error is not recorded: the next try runs again', async () => {
    const errors = spyOn(console, 'error').mockImplementation(() => {})
    const { s } = server()
    expect((await post(s, '/boom', 'k1')).status).toBe(500)
    const again = await post(s, '/boom', 'k1')
    expect(again.status).toBe(500)
    expect(again.headers.get(REPLAYED_HEADER)).toBeNull()
    expect(errors).toHaveBeenCalledTimes(2)
    errors.mockRestore()
  })

  test('an answer too big to keep is sent but not recorded, and said so', async () => {
    const warns = spyOn(console, 'warn').mockImplementation(() => {})
    const { s } = server()
    const r = await post(s, '/huge', 'k1')
    expect((await r.text()).length).toBe(1_000_001)
    expect(warns).toHaveBeenCalledWith(
      'idempotency: the answer to key "k1" is too big to keep; a retry would run again',
    )
    expect(
      (await post(s, '/huge', 'k1')).headers.get(REPLAYED_HEADER),
    ).toBeNull()
    warns.mockRestore()
  })

  test('safe methods are never recorded, key or not', async () => {
    const { s } = server()
    const r = await s.fetch(
      new Request('https://museo.test/order', {
        headers: { [KEY_HEADER]: 'k1' },
      }),
    )
    expect(await r.text()).toBe('list')
    const again = await s.fetch(
      new Request('https://museo.test/order', {
        headers: { [KEY_HEADER]: 'k1' },
      }),
    )
    expect(again.headers.get(REPLAYED_HEADER)).toBeNull()
  })

  test('a store of your own is used as it is', async () => {
    const seen: string[] = []
    const inner = new MemoryStore()
    const store: IdempotencyStore = {
      claim: (key, recorded, ttl) => (
        seen.push(`claim ${key} ${ttl}`),
        inner.claim(key, recorded, ttl)
      ),
      get: (key) => (seen.push(`get ${key}`), inner.get(key)),
      set: (key, recorded, ttl) => (
        seen.push(`set ${key} ${ttl}`),
        inner.set(key, recorded, ttl)
      ),
      delete: (key) => (seen.push(`delete ${key}`), inner.delete(key)),
    }
    const { s } = server({ idempotency: { store, ttl: 5000 } })
    await post(s, '/order', 'k1')
    await post(s, '/order', 'k1')
    expect(seen).toEqual([
      'claim k1 5000',
      'set k1 5000',
      'claim k1 5000',
      'get k1',
    ])
  })

  test('two tries arriving together with a store that waits (Redis-like): the handler runs once', async () => {
    const inner = new MemoryStore()
    const tick = () => new Promise((done) => setTimeout(done, 1))
    const store: IdempotencyStore = {
      claim: async (key, recorded, ttl) => (
        await tick(),
        inner.claim(key, recorded, ttl)
      ),
      get: async (key) => (await tick(), inner.get(key)),
      set: async (key, recorded, ttl) => (
        await tick(),
        inner.set(key, recorded, ttl)
      ),
      delete: async (key) => (await tick(), inner.delete(key)),
    }
    const { s, orders } = server({ idempotency: { store } })
    const answers = await Promise.all([
      post(s, '/order', 'k1'),
      post(s, '/order', 'k1'),
    ])
    expect(orders()).toBe(1)
    // the other try waits (409) or, if the first is done by then, gets its answer (200)
    for (const a of answers) expect([200, 409]).toContain(a.status)
  })
})
