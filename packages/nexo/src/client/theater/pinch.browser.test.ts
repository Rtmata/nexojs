/** `pinch` (F.2) in Chrome: two synthetic touch pointers, and a trackpad's ctrl + wheel. */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { chromium, type Browser, type Page } from 'playwright'
import { bundle, chrome, clockedPage } from './page.fixture'

let browser: Browser
let code: string

const PAGE =
  '<style>body { margin: 0 } #screen { width: 400px; height: 300px; background: #222 }</style><div id="screen"></div>'

/** A touch pointer event: down on the screen, move and up on the document (where pinch listens). */
function touch(page: Page, type: string, id: number, x: number) {
  return page.evaluate(
    ([type, id, x]) => {
      const target =
        type === 'pointerdown' ? document.getElementById('screen')! : document
      target.dispatchEvent(
        new PointerEvent(type as string, {
          pointerId: id as number,
          clientX: x as number,
          clientY: 100,
          pointerType: 'touch',
          bubbles: true,
        }),
      )
    },
    [type, id, x] as const,
  )
}

const scale = (page: Page) => page.evaluate(() => (window as any).zoom.scale)

describe.skipIf(!chrome)('pinch in Chrome', () => {
  beforeAll(async () => {
    browser = await chromium.launch({ channel: 'chrome' })
    code = await bundle()
  })

  afterAll(async () => {
    await browser?.close()
  })

  test('two fingers twice as far apart: twice the size', async () => {
    const { page } = await clockedPage(browser, code, PAGE)
    await page.evaluate(
      () =>
        ((window as any).zoom = (window as any).theater.pinch(
          document.getElementById('screen'),
        )),
    )
    await touch(page, 'pointerdown', 1, 100)
    await touch(page, 'pointerdown', 2, 200)
    await touch(page, 'pointermove', 2, 300)
    expect(await scale(page)).toBeCloseTo(2, 5)
    expect(
      await page.evaluate(() => document.getElementById('screen')!.style.scale),
    ).toBe('2')
  })

  test('past its limit it stretches, and a spring brings it back on release', async () => {
    const { page, clock } = await clockedPage(browser, code, PAGE)
    await page.evaluate(
      () =>
        ((window as any).zoom = (window as any).theater.pinch(
          document.getElementById('screen'),
          { scale: { min: 1, max: 4 } },
        )),
    )
    await touch(page, 'pointerdown', 1, 100)
    await touch(page, 'pointerdown', 2, 200)
    await touch(page, 'pointermove', 2, 600) // raw 5×
    expect(await scale(page)).toBeCloseTo(4.35, 5) // 4 + 1 × 0.35
    await touch(page, 'pointerup', 2, 600)
    await clock.advance(1500)
    expect(await scale(page)).toBeCloseTo(4, 3)
  })

  test('a trackpad pinch (ctrl + wheel) zooms within the limits', async () => {
    const { page } = await clockedPage(browser, code, PAGE)
    await page.evaluate(
      () =>
        ((window as any).zoom = (window as any).theater.pinch(
          document.getElementById('screen'),
        )),
    )
    await page.evaluate(() => {
      const wheel = new WheelEvent('wheel', {
        deltaY: -100,
        ctrlKey: true,
        cancelable: true,
        bubbles: true,
      })
      document.getElementById('screen')!.dispatchEvent(wheel)
      ;(window as any).prevented = wheel.defaultPrevented
    })
    expect(await scale(page)).toBeCloseTo(Math.E, 5)
    expect(await page.evaluate(() => (window as any).prevented)).toBe(true)
  })

  test('set zooms without two fingers (buttons)', async () => {
    const { page, clock } = await clockedPage(browser, code, PAGE)
    await page.evaluate(() => {
      const w = window as any
      w.zoom = w.theater.pinch(document.getElementById('screen'))
      w.zoom.set(2, { duration: 200, easing: 'linear' })
    })
    await clock.advance(240)
    expect(await scale(page)).toBe(2)
  })
})
