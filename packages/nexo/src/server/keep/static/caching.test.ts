import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { boat } from '../../../shared/boat'
import { files } from '../files'
import { keep } from '../keep'

let folder: string
beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), 'caching-'))
  await writeFile(join(folder, 'style.css'), 'body{}')
  await writeFile(join(folder, 'a1b2.webp'), 'webp')
  const when = new Date('2026-10-20T12:00:00Z')
  await utimes(join(folder, 'style.css'), when, when)
})
afterAll(() => rm(folder, { recursive: true }))

const server = () =>
  keep({
    router: boat().get('/covers/*', files(folder, { cache: 3600 })),
    static: [folder, { dir: folder, at: '/media', cache: 'immutable' }],
  })

const get = (
  path: string,
  headers: Record<string, string> = {},
  method = 'GET',
) =>
  server().fetch(new Request(`http://museo.test${path}`, { headers, method }))

describe('static files: validators and freshness', () => {
  test('a file comes with its validators, and asks to be revalidated by default', async () => {
    const r = await get('/style.css')
    expect(r.headers.get('etag')).toMatch(/^W\/"6-[0-9a-f]+"$/)
    expect(r.headers.get('last-modified')).toBe('Tue, 20 Oct 2026 12:00:00 GMT')
    expect(r.headers.get('cache-control')).toBe('no-cache')
    expect(await r.text()).toBe('body{}')
  })

  test('unchanged: a 304 with the validators and nothing else to download', async () => {
    const etag = (await get('/style.css')).headers.get('etag')!
    const r = await get('/style.css', { 'if-none-match': etag })
    expect(r.status).toBe(304)
    expect(r.headers.get('etag')).toBe(etag)
    expect(r.headers.get('cache-control')).toBe('no-cache')
    expect(r.headers.get('content-length')).toBeNull()
    expect(await r.text()).toBe('')
    const dated = await get('/style.css', {
      'if-modified-since': 'Tue, 20 Oct 2026 12:00:00 GMT',
    })
    expect(dated.status).toBe(304)
  })

  test('changed: the whole file again', async () => {
    const r = await get('/style.css', { 'if-none-match': '"old"' })
    expect(r.status).toBe(200)
    expect(await r.text()).toBe('body{}')
  })

  test('a HEAD gets the validators too', async () => {
    const r = await get('/style.css', {}, 'HEAD')
    expect(r.headers.get('etag')).toMatch(/^W\//)
    expect(await r.text()).toBe('')
  })

  test('a mount may say its files never change, or how long they last', async () => {
    const r = await get('/media/a1b2.webp')
    expect(r.headers.get('cache-control')).toBe(
      'public, max-age=31536000, immutable',
    )
    const covers = await get('/covers/a1b2.webp')
    expect(covers.headers.get('cache-control')).toBe('public, max-age=3600')
  })

  test('a resumed download keeps its range only while the file is the same', async () => {
    const same = await get('/style.css', {
      range: 'bytes=0-3',
      'if-range': 'Tue, 20 Oct 2026 12:00:00 GMT',
    })
    expect(same.status).toBe(206)
    const moved = await get('/style.css', {
      range: 'bytes=0-3',
      'if-range': 'Mon, 19 Oct 2026 12:00:00 GMT',
    })
    expect(moved.status).toBe(200)
    expect(await moved.text()).toBe('body{}')
  })

  test('a wrong cache option stops the server at setup', () => {
    expect(() =>
      keep({
        router: boat(),
        static: { dir: folder, at: '/x', cache: 'forever' as never },
      }),
    ).toThrow("keep: cache takes 'immutable', a number of seconds or false")
    expect(() => files(folder, { cache: -5 })).toThrow('keep: cache takes')
  })
})
