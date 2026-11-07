/** panel in real engines (F.3): Chromium, WebKit, Firefox. */
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

const entry = new URL('./panel.fixture.tsx', import.meta.url).pathname
const built = await Bun.build({ entrypoints: [entry], format: 'esm' })
if (!built.success) throw new AggregateError(built.logs, 'bundle failed')
const code = await built.outputs[0]!.text()

for (const [name, engine] of engines) {
  describe(`panel in ${name}`, () => {
    let browser: Browser
    let page: Page
    const play = (scenario: string) =>
      page.evaluate((s) => (window as any).scenarios[s](), scenario)

    beforeAll(async () => {
      browser = await engine.launch()
      page = await browser.newPage()
      await page.setContent('<!doctype html><title>panel</title><body></body>')
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

    test('from markup: params, the events map, idempotent, ended with its signal', async () => {
      expect(await play('fromMarkup')).toEqual([
        'connect 2 true 2',
        'next 3 next',
        'click on el 3',
        'focus input',
        'enter tile',
        'ended',
      ])
    })

    test('the events map sees children added later', async () => {
      expect(await play('laterChildren')).toEqual([
        'connect 0 false 0',
        'next 1 next',
        'click on el 1',
      ])
    })

    test('an unknown panel and a bad param are clear errors', async () => {
      const caught = await play('errors')
      expect(caught[0]).toContain('names no panel')
      expect(caught[1]).toContain('gallery.start: expected a number')
    })

    test('the same panel as an omino ref, with typed params', async () => {
      expect(await play('asRef')).toEqual([
        'connect 5 false 1',
        'next 6 next',
        'click on el 6',
        'ended',
      ])
    })

    test('observe: added connects, removed ends', async () => {
      expect(await play('observing')).toEqual(['connect 0 false 0', 'ended'])
    })
  })
}
