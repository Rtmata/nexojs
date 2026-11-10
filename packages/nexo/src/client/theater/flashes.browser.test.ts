/** The flash checker (C.3) in Chrome: predicted from keyframes, measured from frames. */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { chromium, type Browser } from 'playwright'
import { flashes } from '../../shared/theater/flashes-measured'
import { bundle, chrome, clockedPage, pageWith } from './page.fixture'

let browser: Browser
let code: string

/** A block blinking black / white `hz` times a second, `size` px square. */
const blinking = (hz: number, size: number) =>
  `<style>body { margin: 0; background: #fff } @keyframes blink { 50% { background: #fff } } #b { width: ${size}px; height: ${size}px; background: #000; animation: blink ${1000 / hz}ms steps(1) infinite }</style><div id="b"></div>`

describe.skipIf(!chrome)('flashes in Chrome', () => {
  beforeAll(async () => {
    browser = await chromium.launch({ channel: 'chrome' })
    code = await bundle()
  })

  afterAll(async () => {
    await browser?.close()
  })

  test('predicted: five flashes a second on a big block fails; a small one does not', async () => {
    const big = await pageWith(browser, code, blinking(5, 900))
    const small = await pageWith(browser, code, blinking(5, 40))
    const read = (page: typeof big) =>
      page.evaluate(() =>
        (window as any).theater
          .predictFlashes()
          .map((f: any) => [f.perSecond, f.fails]),
      )
    expect(await read(big)).toEqual([[5, true]])
    expect(await read(small)).toEqual([[5, false]])
  })

  test('predicted: once a second is within the limit', async () => {
    const page = await pageWith(browser, code, blinking(1, 900))
    const found = await page.evaluate(
      () => (window as any).theater.predictFlashes()[0],
    )
    expect([found.perSecond, found.fails]).toEqual([1, false])
  })

  test('measured: the real frames of a big blinking block fail; a still page passes', async () => {
    const { page, clock } = await clockedPage(browser, code, blinking(5, 2000))
    const report = await flashes(page, { seconds: 2, clock })
    expect(report.failures.length).toBeGreaterThan(0)
    const calm = await clockedPage(browser, code, '<p>still</p>')
    expect(
      (await flashes(calm.page, { seconds: 1, clock: calm.clock })).failures,
    ).toEqual([])
  }, 120_000) // a screenshot per frame: the faithful source is the slow one (C.3)
})
