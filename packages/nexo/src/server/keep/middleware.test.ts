import { describe, expect, test } from 'bun:test'
import { boat, type Context, type Handler } from '../../shared/boat'
import { compose, hooks, type Middleware } from './middleware'

const ctx: Context = {
  request: new Request('http://x/'),
  url: new URL('http://x/'),
  params: {},
  link: boat().href,
}

const text: Handler = () => new Response('page')

/** A middleware that records when it runs, to check ordering. */
const tag =
  (name: string, log: string[]): Middleware =>
  (handler) =>
  async (c) => {
    log.push(`${name} in`)
    const response = await handler(c)
    log.push(`${name} out`)
    return response
  }

describe('compose', () => {
  test('the first middleware is the outermost', async () => {
    const log: string[] = []
    await compose([tag('a', log), tag('b', log)], text)(ctx)

    expect(log).toEqual(['a in', 'b in', 'b out', 'a out'])
  })

  test('no middlewares leaves the handler as is', () => {
    expect(compose([], text)).toBe(text)
  })
})

describe('hooks', () => {
  test('runs onRequest before and onResponse after', async () => {
    const log: string[] = []
    const handler = hooks({
      onRequest: () => void log.push('request'),
      onResponse: (_c, response) => {
        log.push('response')
        response.headers.set('x-seen', 'yes')
        return response
      },
    })(() => {
      log.push('handler')
      return new Response('page')
    })

    const response = await handler(ctx)
    expect(log).toEqual(['request', 'handler', 'response'])
    expect(response.headers.get('x-seen')).toBe('yes')
  })

  test('onRequest can answer early and skip the handler', async () => {
    let called = false
    const handler = hooks({
      onRequest: () => new Response('blocked', { status: 403 }),
    })(() => {
      called = true
      return new Response('page')
    })

    expect((await handler(ctx)).status).toBe(403)
    expect(called).toBe(false)
  })
})
