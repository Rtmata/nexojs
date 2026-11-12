/** checkRecipes in real engines: Chromium, WebKit and Firefox through Playwright. */
import { afterAll, describe, expect, test } from 'bun:test'
import {
  chromium,
  firefox,
  webkit,
  type Browser,
  type BrowserType,
} from 'playwright'

const engines: [string, BrowserType][] = [
  ['chromium', chromium],
  ['webkit', webkit],
  ['firefox', firefox],
]

const entry = new URL('./check-recipes.fixture.ts', import.meta.url).pathname
const built = await Bun.build({ entrypoints: [entry], format: 'iife' })
if (!built.success) throw new AggregateError(built.logs, 'bundle failed')
const code = await built.outputs[0]!.text()

for (const [name, engine] of engines) {
  describe(`checkRecipes in ${name}`, () => {
    let browser: Browser | undefined
    afterAll(async () => {
      await browser?.close()
    })

    test('warns once for a recipe whose sheet never reached the page, and stops on abort', async () => {
      browser = await engine.launch()
      const page = await browser.newPage()
      await page.setContent('<!doctype html><title>check</title>')
      await page.addScriptTag({ content: code })
      expect(await page.evaluate(() => (window as any).glyph.run())).toEqual([
        "glyph: forgotten() is used, but its sheet isn't on the page; list forgotten in the static styles of the component that renders it",
      ])
    }, 30_000)
  })
}
