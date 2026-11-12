/** bridge's explicit start in real engines: Chromium, WebKit and Firefox through Playwright. */
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

const entry = new URL('./start.fixture.ts', import.meta.url).pathname
const built = await Bun.build({ entrypoints: [entry], format: 'iife' })
if (!built.success) throw new AggregateError(built.logs, 'bundle failed')
const code = await built.outputs[0]!.text()

const PAGE = `<!doctype html><title>start</title>
<div data-bridge-segment="main"><a href="/elsewhere" data-bridge-target="main">elsewhere</a></div>`

const notStarted = (what: string) =>
  `bridge: ${what}() needs bridge started in this script: call start({ signal }) in your client entry, and drop /_nexo/bridge.js from the page`

for (const [name, engine] of engines) {
  describe(`bridge's start in ${name}`, () => {
    let browser: Browser | undefined
    afterAll(async () => {
      await browser?.close()
    })

    test('importing does nothing; start listens and marks <html>; a second start throws; abort ends it all', async () => {
      browser = await engine.launch()
      const page = await browser.newPage()
      await page.route('http://bridge.test/**', (route) =>
        route.fulfill({ contentType: 'text/html', body: PAGE }),
      )
      await page.goto('http://bridge.test/')
      await page.addScriptTag({ content: code })
      expect(await page.evaluate(() => (window as any).bridgeTest())).toEqual({
        imported: { marked: false, clicked: false },
        early: notStarted('visit'),
        earlyArrivals: notStarted('arrivals'),
        started: { marked: true, clicked: true },
        twice:
          'bridge: it already runs on this page (<html data-bridge-started>); start it once: the served /_nexo/bridge.js or your client entry, not both',
        stopped: { marked: false, clicked: false },
        late: notStarted('visit'),
      })
    }, 30_000)
  })
}
