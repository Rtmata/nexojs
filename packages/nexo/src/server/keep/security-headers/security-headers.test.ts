import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { boat } from '../../../shared/boat'
import { keep, type KeepOptions } from '../keep'

let folder: string
beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), 'security-headers-'))
  await writeFile(join(folder, 'logo.svg'), '<svg/>')
})
afterAll(() => rm(folder, { recursive: true }))

function server(options: Omit<KeepOptions, 'router'> = {}) {
  const router = boat()
    .get('/', (ctx) => new Response(`nonce ${ctx.nonce ?? 'none'}`))
    .get(
      '/own',
      () =>
        new Response('own', { headers: { 'referrer-policy': 'no-referrer' } }),
    )
    .get('/go', () => Response.redirect('https://museo.test/', 303))
  return keep({ router, static: folder, ...options })
}

const get = (s: ReturnType<typeof server>, url: string) =>
  s.fetch(new Request(url))

const DEFAULTS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'SAMEORIGIN',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  'x-permitted-cross-domain-policies': 'none',
  'x-dns-prefetch-control': 'off',
  'x-xss-protection': '0',
}

const headersOf = (r: Response, names: string[]) =>
  Object.fromEntries(names.map((n) => [n, r.headers.get(n)]))

describe('securityHeaders: the fixed headers', () => {
  test('the full set on a page, a file, a 404 and a redirect', async () => {
    const s = server()
    const names = Object.keys(DEFAULTS)
    for (const path of ['/', '/logo.svg', '/nowhere', '/go']) {
      const r = await get(s, `https://museo.test${path}`)
      expect(headersOf(r, names)).toEqual(DEFAULTS)
    }
  })

  test('HSTS travels over HTTPS only', async () => {
    const s = server()
    const secure = await get(s, 'https://museo.test/')
    expect(secure.headers.get('strict-transport-security')).toBe(
      'max-age=15552000; includeSubDomains',
    )
    const plain = await get(s, 'http://localhost:3000/')
    expect(plain.headers.get('strict-transport-security')).toBeNull()
  })

  test('a knob replaces the default or leaves the header out', async () => {
    const s = server({
      securityHeaders: { frameOptions: false, resourcePolicy: 'cross-origin' },
    })
    const r = await get(s, 'https://museo.test/')
    expect(r.headers.get('x-frame-options')).toBeNull()
    expect(r.headers.get('cross-origin-resource-policy')).toBe('cross-origin')
    expect(r.headers.get('x-content-type-options')).toBe('nosniff')
  })

  test('a header the handler set itself stays', async () => {
    const r = await get(server(), 'https://museo.test/own')
    expect(r.headers.get('referrer-policy')).toBe('no-referrer')
  })

  test('off: no headers, no nonce', async () => {
    const r = await get(
      server({ securityHeaders: false }),
      'https://museo.test/',
    )
    expect(r.headers.get('x-content-type-options')).toBeNull()
    expect(await r.text()).toBe('nonce none')
  })
})

describe('securityHeaders: the policy', () => {
  test('written as given, with the nonce of the request', async () => {
    const s = server({
      securityHeaders: {
        csp: {
          'default-src': ["'self'"],
          'script-src': ["'self'", 'nonce', "'inline-speculation-rules'"],
          'img-src': ["'self'", 'data:'],
          'upgrade-insecure-requests': [],
        },
      },
    })
    const r = await get(s, 'https://museo.test/')
    const nonce = (await r.text()).slice('nonce '.length)
    expect(nonce).toMatch(/^[0-9a-f]{32}$/)
    expect(r.headers.get('content-security-policy')).toBe(
      `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'inline-speculation-rules'; img-src 'self' data:; upgrade-insecure-requests`,
    )
  })

  test('each request gets its own nonce', async () => {
    const s = server({ securityHeaders: { csp: { 'script-src': ['nonce'] } } })
    const a = await (await get(s, 'https://museo.test/')).text()
    const b = await (await get(s, 'https://museo.test/')).text()
    expect(a).not.toBe(b)
  })

  test('report only: reported, not enforced', async () => {
    const s = server({
      securityHeaders: { csp: { 'default-src': ["'self'"] }, reportOnly: true },
    })
    const r = await get(s, 'https://museo.test/')
    expect(r.headers.get('content-security-policy')).toBeNull()
    expect(r.headers.get('content-security-policy-report-only')).toBe(
      "default-src 'self'",
    )
  })

  test('an unknown directive is a setup mistake', () => {
    expect(() =>
      server({ securityHeaders: { csp: { scriptSrc: ["'self'"] } } }),
    ).toThrow(
      `securityHeaders: "scriptSrc" is not a Content-Security-Policy directive (write it as in the header: 'script-src')`,
    )
  })

  test('no policy, still a nonce: the context keeps one shape', async () => {
    const r = await get(server(), 'https://museo.test/')
    expect(await r.text()).toMatch(/^nonce [0-9a-f]{32}$/)
    expect(r.headers.get('content-security-policy')).toBeNull()
  })
})
