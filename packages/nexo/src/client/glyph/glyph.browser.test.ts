/**
 * adoptTheme in real engines (G.2): Chromium, WebKit and Firefox through
 * Playwright. The theme is made in Bun, as `themeFrom` would make it from
 * a person's JSON; the page only adopts it and lets it go.
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
import { themeFrom } from '../../shared/glyph/theme-from'
import { defineTokens } from '../../shared/glyph/tokens'

/** Starting a browser can take longer than a test's default 5 s (Firefox did). */
const LAUNCH = 30_000

const engines: [string, BrowserType][] = [
  ['chromium', chromium],
  ['webkit', webkit],
  ['firefox', firefox],
]

const entry = new URL('./adopt-theme.fixture.ts', import.meta.url).pathname
const built = await Bun.build({ entrypoints: [entry], format: 'iife' })
if (!built.success) throw new AggregateError(built.logs, 'bundle failed')
const code = await built.outputs[0]!.text()

const tokens = defineTokens({
  color: { text: '#222', surface: '#fff' },
})

const mine = themeFrom(tokens, {
  name: 'mine',
  colorScheme: 'dark',
  color: { text: '#eee', surface: '#123' },
})
if (!mine.ok) throw new Error(mine.errors.join('\n'))

const PAGE = `<!doctype html><title>glyph client</title>
<style>${tokens.css}</style>
<section id="room" data-theme="mine">a room for a person's theme</section>`

function computed(page: Page, property: string): Promise<string> {
  return page.evaluate(
    (property) =>
      getComputedStyle(document.getElementById('room')!).getPropertyValue(
        property,
      ),
    property,
  )
}

for (const [name, engine] of engines) {
  describe(`adoptTheme in ${name}`, () => {
    let browser: Browser
    let page: Page

    beforeAll(async () => {
      browser = await engine.launch()
      page = await browser.newPage()
      await page.setContent(PAGE)
      await page.addScriptTag({ content: code })
    }, LAUNCH)
    afterAll(async () => {
      await browser?.close()
    })

    test('applies the theme while the signal lives, and removes it on abort (C.4)', async () => {
      expect(await computed(page, 'color')).toBe('rgb(0, 0, 0)')
      await page.evaluate(
        (css) => (window as any).glyph.adopt(css),
        mine.theme.css,
      )
      expect(await computed(page, 'color')).toBe('rgb(238, 238, 238)')
      expect(await computed(page, 'background-color')).toBe('rgb(17, 34, 51)')
      expect(await computed(page, 'color-scheme')).toBe('dark')
      await page.evaluate(() => (window as any).glyph.stop())
      expect(await page.evaluate(() => (window as any).glyph.adopted())).toBe(0)
      expect(await computed(page, 'color')).toBe('rgb(0, 0, 0)')
    })

    test('an aborted signal adopts nothing', async () => {
      await page.evaluate(
        (css) => (window as any).glyph.adopt(css),
        mine.theme.css,
      )
      expect(await page.evaluate(() => (window as any).glyph.adopted())).toBe(0)
    })
  })
}
