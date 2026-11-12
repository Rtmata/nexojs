/** bridge's options from a script and from markup, in real engines. */
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

const entry = new URL('./options.fixture.ts', import.meta.url).pathname
const built = await Bun.build({ entrypoints: [entry], format: 'iife' })
if (!built.success) throw new AggregateError(built.logs, 'bundle failed')
const code = await built.outputs[0]!.text()

const PAGE = `<!doctype html><html data-bridge-history="push" data-bridge-fail="errors" data-bridge-busy="spinner"><title>o</title>
<body><p id="inside">x</p>
<a id="quiet" href="/q" data-bridge-target="_top" data-bridge-history="none" data-bridge-fail="_none" data-bridge-busy="_none">q</a></body></html>`

for (const [name, engine] of engines) {
  describe(`bridge's options in ${name}`, () => {
    let browser: Browser | undefined
    afterAll(async () => {
      await browser?.close()
    })

    test('left out: the markup decides; null: none on purpose; markup says none with none / _none', async () => {
      browser = await engine.launch()
      const page = await browser.newPage()
      await page.setContent(PAGE)
      await page.addScriptTag({ content: code })
      expect(await page.evaluate(() => (window as any).optionsTest())).toEqual({
        leftOut: { history: 'push', fail: 'errors', busy: 'spinner' },
        none: { history: null, fail: null, busy: null },
        markupNone: { history: null, fail: null, busy: null },
      })
    }, 30_000)
  })
}
