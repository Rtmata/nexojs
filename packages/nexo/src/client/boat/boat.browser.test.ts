/**
 * The client router in real engines (F.3): Chromium, WebKit, Firefox, on a
 * page served by keep so pushState and the Navigation API work.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import {
  chromium,
  firefox,
  webkit,
  type Browser,
  type BrowserType,
  type Page,
} from 'playwright'

const engines: [string, BrowserType][] = [
  ['chromium', chromium],
  ['webkit', webkit],
  ['firefox', firefox],
]

const entry = new URL('./boat.fixture.tsx', import.meta.url).pathname
const built = await Bun.build({ entrypoints: [entry], format: 'esm' })
if (!built.success) throw new AggregateError(built.logs, 'bundle failed')
const code = await built.outputs[0]!.text()

/**
 * A blank page on a real HTTP origin. Plain `Bun.serve`, not keep: this test
 * isn't about the server, and stopping a keep server that a browser used,
 * in a process that also ran `Bun.build`, makes a later file's Chrome
 * disconnect (an open investigation, see VISION.md).
 */
let server: ReturnType<typeof Bun.serve>

describe('boat client', () => {
  beforeAll(() => {
    const html = { 'content-type': 'text/html; charset=utf-8' }
    const blank = '<!doctype html><title>boat</title><body></body>'
    server = Bun.serve({
      port: 0,
      fetch: () => new Response(blank, { headers: html }),
    })
  })
  afterAll(async () => {
    await server?.stop()
  })

  for (const [name, engine] of engines) {
    describe(`boat client in ${name}`, () => {
      let browser: Browser
      let page: Page
      const play = (scenario: string, arg?: unknown) =>
        page.evaluate(([s, a]) => (window as any).scenarios[s as string](a), [
          scenario,
          arg,
        ] as const)

      beforeAll(async () => {
        browser = await engine.launch()
        page = await browser.newPage()
        await page.goto(server.url.href)
        await page.evaluate(async (code) => {
          const url = URL.createObjectURL(
            new Blob([code], { type: 'text/javascript' }),
          )
          ;(window as any).scenarios = await import(url)
        }, code)
      })
      afterAll(async () => {
        await browser?.close()
      })

      test('routes with load: the old page stays while loading, back returns', async () => {
        expect(await play('memoryRoutes')).toEqual({
          first: 'shelf',
          during: { heading: 'shelf', busy: 'true' },
          loaded: 'book 2',
          back: 'shelf',
          log: ['load 2'],
        })
      })

      test('the latest navigation wins, the stale load is aborted', async () => {
        expect(await play('latestWins')).toEqual({
          status: 'ready',
          title: 'book 2',
          log: ['load 1', 'aborted 1', 'load 2'],
        })
      })

      test('notFound(): from load, for no route, and claiming nothing without it', async () => {
        expect(await play('notFoundCases')).toEqual({
          fromLoad: 'lost',
          unmatched: 'lost',
          claimsWithout: false,
        })
      })

      test('the same patterns as the server: static beats a param', async () => {
        expect(await play('specificity')).toEqual({
          static: true,
          param: { id: '7' },
          none: null,
        })
      })

      for (const kind of ['navigation', 'history', 'hash']) {
        test(`${kind}: the chain — boat claims its links, the rest go on; back returns`, async () => {
          const result = await play('clickChain', kind)
          expect(result.seen).toEqual([
            'to-server:false',
            'to-new:false',
            'to-book:true',
          ])
          expect(result.heading).toBe('book 3')
          if (kind === 'hash') expect(result.hash).toBe('#/book/3')
          else expect(result.path).toBe('/book/3')
          expect(result.back).toBe(null)
        })
      }
    })
  }
})
