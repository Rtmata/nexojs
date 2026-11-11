import { describe, expect, mock, spyOn, test } from 'bun:test'
import { keep } from '../../server/keep'
import { boat } from '../boat'
import { CommandError, http, isCommandError, tauri, terminal } from './index'
import * as v from './pieces/validators'
import { describe as describeIssue } from './client'
import { check } from './schema'

type Book = { id: number; title: string }

const api = terminal({
  book: {
    args: v.object({ id: v.number() }),
    result: v.custom<Book>(),
    errors: { notFound: { status: 404 } },
    read: true,
  },
  save: {
    args: v.object({
      title: v.string(),
      tags: v.optional(v.array(v.string())),
    }),
    result: v.custom<Book>(),
  },
  boom: {},
})

const books = new Map([[1, { id: 1, title: 'Dune' }]])
const seen: unknown[] = []
const handlers = {
  book: ({ id }: { id: number }, { fail }: any) =>
    books.get(id) ?? fail('notFound'),
  save: (
    args: { title: string; tags?: string[] },
    { signal }: { signal: AbortSignal },
  ) => {
    seen.push(args, signal instanceof AbortSignal)
    return { id: 2, title: args.title }
  },
  boom: () => {
    throw new Error('the database password is hunter2')
  },
}
const server = keep({ router: boat() }).use(api.serve(handlers))
const requests: Request[] = []
const viaKeep = (url: string | URL | Request, init?: RequestInit) => {
  const request = new Request(new URL(String(url), 'http://site.test'), init)
  requests.push(request)
  return server.fetch(request)
}
const commands = api.client(http({ fetch: viaKeep }))

describe('validators (Standard Schema)', () => {
  test('issues carry their path; unknown keys are dropped', () => {
    const s = v.object({
      id: v.number(),
      tags: v.array(v.string()),
      side: v.oneOf(['l', 'r']),
    })
    expect(check(s, { id: 'x', tags: ['a', 2], side: 'up', extra: 1 })).toEqual(
      {
        issues: [
          { message: 'expected a number', path: ['id'] },
          { message: 'expected a string', path: ['tags', 1] },
          { message: 'expected one of l, r', path: ['side'] },
        ],
      },
    )
    expect(check(s, { id: 1, tags: [], side: 'l', extra: 1 })).toEqual({
      value: { id: 1, tags: [], side: 'l' },
    })
  })

  test('the interface others implement', () => {
    expect(v.number()['~standard']).toMatchObject({
      version: 1,
      vendor: 'nexo',
    })
  })
})

describe('terminal over HTTP (R.24–R.26)', () => {
  test('a read command goes as GET; a change as POST with JSON', async () => {
    requests.length = 0
    expect(await commands.exec('book', { id: 1 })).toEqual({
      id: 1,
      title: 'Dune',
    })
    expect(await commands.exec('save', { title: 'Emma' })).toEqual({
      id: 2,
      title: 'Emma',
    })
    expect(
      requests.map((r) => `${r.method} ${new URL(r.url).pathname}`),
    ).toEqual(['GET /_nexo/terminal/book', 'POST /_nexo/terminal/save'])
  })

  test('a declared error: its status, its code, typed on the client', async () => {
    const error = await commands.exec('book', { id: 9 }).catch((e) => e)
    expect(isCommandError(error, 'notFound')).toBe(true)
    expect(error.status).toBe(404)
  })

  test('the server always validates: an invalid arg never reaches the handler', async () => {
    seen.length = 0
    const response = await viaKeep('/_nexo/terminal/save', post({ title: 42 }))
    expect(response.status).toBe(400)
    expect((await response.json()).code).toBe('invalidArgs')
    expect(seen).toEqual([])
  })

  test('the client checks args before they leave', async () => {
    requests.length = 0
    // @ts-expect-error title must be a string
    const error = await commands.exec('save', { title: 42 }).catch((e) => e)
    expect(error).toBeInstanceOf(CommandError)
    expect(error.code).toBe('invalidArgs')
    expect(requests).toHaveLength(0)
  })

  test('a bug is masked as internal; the server reports it', async () => {
    const quiet = spyOn(console, 'error').mockImplementation(() => {})
    const error = (await commands.exec('boom').catch((e) => e)) as CommandError
    expect(error.code).toBe('internal')
    expect(error.message).not.toContain('hunter2')
    expect(quiet).toHaveBeenCalled()
    quiet.mockRestore()
  })

  test('GET only for read commands; a cross-site navigation GET is refused', async () => {
    expect((await viaKeep('/_nexo/terminal/save?args={}')).status).toBe(405)
    const navigation = {
      headers: { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate' },
    }
    expect(
      (await viaKeep('/_nexo/terminal/book?args={"id":1}', navigation)).status,
    ).toBe(403)
    const sameSite = {
      headers: { 'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'cors' },
    }
    expect(
      (await viaKeep('/_nexo/terminal/book?args={"id":1}', sameSite)).status,
    ).toBe(200)
  })

  test('unknown commands, args for a command that takes none, bad JSON', async () => {
    expect((await viaKeep('/_nexo/terminal/nope', post({}))).status).toBe(404)
    expect((await viaKeep('/_nexo/terminal/boom', post({ x: 1 }))).status).toBe(
      400,
    )
    const asJson = { 'content-type': 'application/json' }
    expect(
      (
        await viaKeep('/_nexo/terminal/save', {
          method: 'POST',
          headers: asJson,
          body: '{',
        })
      ).status,
    ).toBe(400)
    // a POST that doesn't say it's JSON (a cross-site form, a no-cors fetch) is refused
    expect(
      (await viaKeep('/_nexo/terminal/save', { method: 'POST', body: '{}' }))
        .status,
    ).toBe(415)
    expect((await viaKeep('/_nexo/terminal/%E0%A4%A', post({}))).status).toBe(
      404,
    ) // a name that isn't valid percent-encoding names nothing
  })

  test('the handler gets the request signal; the client can abort', async () => {
    seen.length = 0
    await commands.exec('save', { title: 'Kim' })
    expect(seen[1]).toBe(true)
    const controller = new AbortController()
    controller.abort()
    /** Never answers; only its signal ends it, as a real fetch's would. */
    const never = (_url: string, init: RequestInit) =>
      new Promise<Response>((_, reject) => {
        const signal = init.signal!
        if (signal.aborted) reject(signal.reason)
        signal.addEventListener('abort', () => reject(signal.reason))
      })
    const slow = api.client(http({ fetch: never }))
    await expect(
      slow.exec('book', { id: 1 }, { signal: controller.signal }),
    ).rejects.toThrow()
  })

  test('types: names, args and declared codes (never run)', () => {
    const never = () => {
      // @ts-expect-error no command "books"
      commands.exec('books', { id: 1 })
      // @ts-expect-error id is a number
      commands.exec('book', { id: '1' })
      api.serve({
        ...handlers,
        // @ts-expect-error "gone" is not one of book's errors
        book: (_args, { fail }) => fail('gone'),
      })
    }
    expect(typeof never).toBe('function')
  })
})

describe('replies that are not the contract (review)', () => {
  test('a 2xx that is not JSON is an error, never a null result', async () => {
    const portal = async () =>
      new Response('<html>Sign in</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })
    const behindPortal = api.client(http({ fetch: portal }))
    const error = await behindPortal.exec('book', { id: 1 }).catch((e) => e)
    expect(error).toBeInstanceOf(CommandError)
    expect([error.code, error.message]).toEqual([
      'internal',
      'not a JSON reply (200)',
    ])
  })

  test('a non-JSON failure keeps its text and status', async () => {
    const gateway = async () => new Response('Bad gateway', { status: 502 })
    const error = await api
      .client(http({ fetch: gateway }))
      .exec('book', { id: 1 })
      .catch((e) => e)
    expect([error.code, error.message, error.status]).toEqual([
      'internal',
      'Bad gateway',
      502,
    ])
  })

  test('an invalid-args reply carries messages and paths, never the rejected input', async () => {
    const response = await viaKeep(
      '/_nexo/terminal/save',
      post({ title: 'hunter2-as-a-number'.length }),
    )
    const body = (await response.json()) as { data: unknown[] }
    expect(response.status).toBe(400)
    expect(body.data).toEqual([
      { message: 'expected a string', path: ['title'] },
    ])
  })

  test('no reply at all (offline) is a CommandError too', async () => {
    const offline = async () => {
      throw new TypeError('Failed to fetch')
    }
    const error = await api
      .client(http({ fetch: offline }))
      .exec('book', { id: 1 })
      .catch((e) => e)
    expect(isCommandError(error)).toBe(true)
    expect([error.code, error.message]).toEqual([
      'unreachable',
      'no reply: Failed to fetch',
    ])
  })

  test('issue paths with { key } segments (Valibot, Zod) read as keys', () => {
    expect(
      describeIssue({ message: 'expected a string', path: [{ key: 'id' }, 0] }),
    ).toBe('id.0: expected a string')
  })
})

describe('terminal through Tauri', () => {
  test('a result; { kind, message } becomes the code; aborting stops waiting', async () => {
    const invoke = mock(
      async (command: string, args?: Record<string, unknown>) => {
        if (command === 'book' && args?.id === 1)
          return { id: 1, title: 'Dune' }
        if (command === 'book')
          throw { kind: 'notFound', message: 'no such book' }
        return new Promise(() => {})
      },
    )
    const ipc = api.client(tauri({ invoke }))
    expect(await ipc.exec('book', { id: 1 })).toEqual({ id: 1, title: 'Dune' })
    const error = await ipc.exec('book', { id: 2 }).catch((e) => e)
    expect([error.code, error.message]).toEqual(['notFound', 'no such book'])
    const nothing = api.client(
      tauri({ invoke: async () => Promise.reject(null) }),
    )
    const bare = await nothing.exec('book', { id: 1 }).catch((e) => e)
    expect([bare.code, bare.message]).toEqual(['internal', 'internal error'])
    const controller = new AbortController()
    const waiting = ipc.exec(
      'save',
      { title: 'x' },
      { signal: controller.signal },
    )
    controller.abort()
    await expect(waiting).rejects.toBe(controller.signal.reason)
  })
})

function post(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }
}
