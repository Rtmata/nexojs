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

/** Safari's gesture event, made by hand: Chrome has none. */
function gesture(page: Page, type: string, scale = 1) {
  return page.evaluate(
    ([type, scale]) => {
      const event = new Event(type as string, { cancelable: true })
      Object.assign(event, { scale })
      document.getElementById('screen')!.dispatchEvent(event)
    },
    [type, scale] as const,
  )
}

/** A fresh page whose `#screen` pinches as `window.zoom`. */
async function pinchPage() {
  const clocked = await clockedPage(browser, code, PAGE)
  await clocked.page.evaluate(
    () =>
      ((window as any).zoom = (window as any).theater.pinch(
        document.getElementById('screen'),
      )),
  )
  return clocked
}

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

  test('a third finger is left out: the first two keep the pinch', async () => {
    const { page } = await pinchPage()
    await touch(page, 'pointerdown', 1, 100)
    await touch(page, 'pointerdown', 2, 200)
    await touch(page, 'pointerdown', 3, 50)
    await touch(page, 'pointermove', 3, 20)
    await touch(page, 'pointermove', 2, 300)
    expect(await scale(page)).toBeCloseTo(2, 5)
  })

  test('a finger that lost its capture no longer counts', async () => {
    const { page } = await pinchPage()
    await touch(page, 'pointerdown', 1, 100)
    await page.evaluate(() =>
      document.getElementById('screen')!.dispatchEvent(
        new PointerEvent('lostpointercapture', {
          pointerId: 1,
          bubbles: true,
        }),
      ),
    )
    await touch(page, 'pointerdown', 2, 100)
    await touch(page, 'pointerdown', 3, 200)
    await touch(page, 'pointermove', 3, 300)
    expect(await scale(page)).toBeCloseTo(2, 5)
  })

  test('two fingers pinching: a gesture event (iOS) changes nothing', async () => {
    const { page } = await pinchPage()
    await touch(page, 'pointerdown', 1, 100)
    await touch(page, 'pointerdown', 2, 200)
    await gesture(page, 'gesturestart')
    await touch(page, 'pointermove', 2, 300)
    await gesture(page, 'gesturechange', 3)
    expect(await scale(page)).toBeCloseTo(2, 5)
  })

  test('without two fingers, gesture events pinch (Safari) until they end', async () => {
    const { page } = await pinchPage()
    await gesture(page, 'gesturestart')
    await gesture(page, 'gesturechange', 2)
    expect(await scale(page)).toBeCloseTo(2, 5)
    await gesture(page, 'gestureend', 2)
    await gesture(page, 'gesturechange', 3)
    expect(await scale(page)).toBeCloseTo(2, 5)
  })

  test('two fingers take over a gesture already running', async () => {
    const { page } = await pinchPage()
    await gesture(page, 'gesturestart')
    await touch(page, 'pointerdown', 1, 100)
    await touch(page, 'pointerdown', 2, 200)
    await touch(page, 'pointermove', 2, 300)
    expect(await scale(page)).toBeCloseTo(2, 5)
    await gesture(page, 'gesturechange', 3)
    expect(await scale(page)).toBeCloseTo(2, 5)
  })

  test('a trackpad zoom stops the release spring, as a new pinch would', async () => {
    const { page, clock } = await pinchPage()
    await touch(page, 'pointerdown', 1, 100)
    await touch(page, 'pointerdown', 2, 200)
    await touch(page, 'pointermove', 2, 600) // 4.35, past max 4
    await touch(page, 'pointerup', 2, 600) // springs back toward 4
    await page.evaluate(() =>
      document.getElementById('screen')!.dispatchEvent(
        new WheelEvent('wheel', {
          deltaY: 50,
          ctrlKey: true,
          cancelable: true,
        }),
      ),
    )
    const zoomed = await scale(page)
    await clock.advance(1500)
    expect(await scale(page)).toBe(zoomed)
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
