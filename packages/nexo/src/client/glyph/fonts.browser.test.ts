/**
 * Fonts in real engines (F.1–F.3): Chromium, WebKit and Firefox through
 * Playwright, with DejaVu Sans Mono (fixtures/, Bitstream Vera license)
 * served at http://glyph.test/fonts/test.ttf.
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
import { defineFonts } from '../../shared/glyph/fonts'

const engines: [string, BrowserType][] = [
  ['chromium', chromium],
  ['webkit', webkit],
  ['firefox', firefox],
]

const entry = new URL('./fonts.fixture.ts', import.meta.url).pathname
const built = await Bun.build({ entrypoints: [entry], format: 'iife' })
if (!built.success) throw new AggregateError(built.logs, 'bundle failed')
const code = await built.outputs[0]!.text()
const font = await Bun.file(
  new URL('./fixtures/DejaVuSansMono.ttf', import.meta.url),
).bytes()

const fonts = defineFonts({
  mono: {
    family: 'Test Mono',
    files: [{ src: '/fonts/test.ttf' }],
    fallback: 'monospace',
  },
})

for (const [name, engine] of engines) {
  describe(`fonts in ${name}`, () => {
    let browser: Browser
    let page: Page

    beforeAll(async () => {
      browser = await engine.launch()
      page = await browser.newPage()
      await page.route('http://glyph.test/**', (route) =>
        route.request().url().endsWith('/fonts/test.ttf')
          ? route.fulfill({ body: Buffer.from(font), contentType: 'font/ttf' })
          : route.fulfill({
              contentType: 'text/html',
              body: `<!doctype html><style>${fonts.css}</style><p id="p" style='font-family: ${fonts.mono.stack}'>iiii</p>`,
            }),
      )
      await page.goto('http://glyph.test/')
      await page.addScriptTag({ content: code })
    }, 30_000)
    afterAll(async () => {
      await browser?.close()
    })

    test("defineFonts' @font-face loads the file", async () => {
      const status = await page.evaluate(async () => {
        await document.fonts.load('16px "Test Mono"')
        return [...document.fonts].find(
          (f) => f.family.replace(/"/g, '') === 'Test Mono',
        )?.status
      })
      expect(status).toBe('loaded')
    })

    test('measureFont: the font against itself is 1, its ascent and descent from the browser', async () => {
      const metrics = await page.evaluate(async () => {
        const g = (window as any).glyph
        await g.loadFont(
          { family: 'Same Mono', files: [{ src: '/fonts/test.ttf' }] },
          { signal: new AbortController().signal },
        )
        return g.measureFont(
          {
            family: 'Test Mono',
            stack: '',
            files: [{ src: '/fonts/test.ttf' }],
          },
          { local: 'Same Mono' },
        )
      })
      expect(metrics.sizeAdjust).toBe(1)
      expect(metrics.ascent).toBeGreaterThan(0.7)
      expect(metrics.ascent).toBeLessThan(1.1)
      expect(metrics.descent).toBeGreaterThan(0.1)
      expect(metrics.descent).toBeLessThan(0.4)
    })

    test('loadFont from bytes: in the page while the signal lives, its text works in an iframe', async () => {
      const result = await page.evaluate(async () => {
        const g = (window as any).glyph
        const bytes = await (await fetch('/fonts/test.ttf')).arrayBuffer()
        const controller = new AbortController()
        const mine = await g.loadFont(
          { family: 'Mi Fuente', files: [{ src: bytes }] },
          { signal: controller.signal },
        )
        const frame = document.createElement('iframe')
        frame.srcdoc = `<style>${mine.css}</style><p>x</p>`
        const ready = new Promise((resolve) =>
          frame.addEventListener('load', resolve, { once: true }),
        )
        document.body.append(frame)
        await ready
        const inFrame =
          await frame.contentDocument!.fonts.load('16px "Mi Fuente"')
        const named = () =>
          [...document.fonts].some(
            (f) => f.family.replace(/"/g, '') === 'Mi Fuente',
          )
        const before = named()
        controller.abort()
        return {
          blob: mine.css.includes('url("blob:'),
          inFrame: inFrame.length,
          before,
          after: named(),
        }
      })
      expect(result).toEqual({
        blob: true,
        inFrame: 1,
        before: true,
        after: false,
      })
    })

    test('loadFont: bytes that are not a font reject, saying what the browser reads', async () => {
      const message = await page.evaluate(async () => {
        const g = (window as any).glyph
        try {
          await g.loadFont(
            { family: 'Bad', files: [{ src: new Uint8Array([1, 2, 3]) }] },
            { signal: new AbortController().signal },
          )
        } catch (error) {
          return (error as Error).message
        }
      })
      expect(message).toBe(
        'glyph: loadFont "Bad": a file isn\'t a font the browser can read; it reads WOFF2, WOFF, TTF and OTF',
      )
    })
  })
}
