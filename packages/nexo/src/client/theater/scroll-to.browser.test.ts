/** follow, scrollTo and smoothWheel in Chrome. */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { chromium, type Browser } from 'playwright'
import { bundle, chrome, clockedPage, pageWith } from './page.fixture'

let browser: Browser
let code: string

const TALL =
  '<style>body { margin: 0 }</style><div style="height: 2000px"></div><h2 id="nes" style="margin: 0">NES</h2><div style="height: 3000px"></div>'

describe.skipIf(!chrome)('follow, scrollTo, smoothWheel in Chrome', () => {
  beforeAll(async () => {
    browser = await chromium.launch({ channel: 'chrome' })
    code = await bundle()
  })

  afterAll(async () => {
    await browser?.close()
  })

  test('follow: a signal that moves toward its source, then rests on it', async () => {
    const { page, clock } = await clockedPage(browser, code, '')
    await page.evaluate(() => {
      const w = window as any
      w.price = w.theater.connectorSignal(0)
      w.smooth = w.theater.follow(w.price, { duration: 200, easing: 'linear' })
      w.price.set(100)
    })
    await clock.advance(16) // the watch runs, the tween starts
    await clock.advance(100)
    const mid = await page.evaluate(() => (window as any).smooth.get())
    await clock.advance(200)
    const end = await page.evaluate(() => (window as any).smooth.get())
    expect(mid).toBeGreaterThan(20)
    expect(mid).toBeLessThan(80)
    expect(end).toBe(100)
  })

  test('scrollTo: the page glides to the element with the curve', async () => {
    const { page, clock } = await clockedPage(browser, code, TALL)
    await page.evaluate(() =>
      (window as any).theater.scrollTo(document.getElementById('nes'), {
        duration: 400,
        easing: 'linear',
        offset: 100,
      }),
    )
    await clock.advance(200)
    const mid = await page.evaluate(() => scrollY)
    await clock.advance(240)
    expect(mid).toBeGreaterThan(700)
    expect(mid).toBeLessThan(1200)
    expect(await page.evaluate(() => scrollY)).toBe(1900)
  })

  test('scrollTo under scroll-behavior: smooth: each frame lands where the curve says', async () => {
    const { page, clock } = await clockedPage(
      browser,
      code,
      `<style>html { scroll-behavior: smooth }</style>${TALL}`,
    )
    await page.evaluate(() =>
      (window as any).theater.scrollTo(2000, {
        duration: 400,
        easing: 'linear',
      }),
    )
    await clock.advance(200)
    const mid = await page.evaluate(() => scrollY)
    expect(mid).toBeGreaterThan(900) // the browser's own glide would still be near the start
    expect(mid).toBeLessThan(1100)
  })

  test('scrollTo under reduced motion: there at once', async () => {
    const { page, clock } = await clockedPage(browser, code, TALL)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.evaluate(() =>
      (window as any).theater.scrollTo(2000, { duration: 400 }),
    )
    await clock.advance(16)
    expect(await page.evaluate(() => scrollY)).toBe(2000)
  })

  test('smoothWheel: sideways, shift and no-room wheels stay native', async () => {
    const page = await pageWith(browser, code, TALL)
    const prevented = await page.evaluate(() => {
      ;(window as any).theater.smoothWheel({
        signal: new AbortController().signal,
      })
      const wheel = (init: WheelEventInit) => {
        const event = new WheelEvent('wheel', {
          ...init,
          cancelable: true,
          bubbles: true,
        })
        document.body.dispatchEvent(event)
        return event.defaultPrevented
      }
      return [
        wheel({ deltaX: 400 }),
        wheel({ deltaY: 400, shiftKey: true }),
        wheel({ deltaY: -400 }), // already at the top
      ]
    })
    expect(prevented).toEqual([false, false, false])
  })

  test('smoothWheel: glides under scroll-behavior: smooth, and lets go when the page moves on its own', async () => {
    const page = await pageWith(
      browser,
      code,
      `<style>html { scroll-behavior: smooth }</style>${TALL}`,
    )
    const result = await page.evaluate(async () => {
      const frames = async (n: number) => {
        for (let i = 0; i < n; i++) await new Promise(requestAnimationFrame)
      }
      const wheel = (deltaY: number) =>
        document.body.dispatchEvent(
          new WheelEvent('wheel', { deltaY, cancelable: true, bubbles: true }),
        )
      ;(window as any).theater.smoothWheel({
        signal: new AbortController().signal,
      })
      wheel(400)
      await frames(60)
      const glided = scrollY
      wheel(400)
      await frames(2)
      window.scrollTo({ top: 3000, behavior: 'instant' }) // an anchor jump mid-glide
      await frames(30)
      const jumped = scrollY
      wheel(100)
      await frames(60)
      return [glided, jumped, scrollY]
    })
    expect(result[0]).toBeCloseTo(400, 0)
    expect(result[1]).toBe(3000)
    expect(result[2]).toBeCloseTo(3100, 0)
  })

  test('smoothWheel: a negative or NaN smoothing throws', async () => {
    const page = await pageWith(browser, code, TALL)
    const errors = await page.evaluate(() =>
      [-1, NaN].map((smoothing) => {
        try {
          ;(window as any).theater.smoothWheel({
            signal: new AbortController().signal,
            smoothing,
          })
          return 'none'
        } catch (error) {
          return (error as Error).name
        }
      }),
    )
    expect(errors).toEqual(['RangeError', 'RangeError'])
  })

  test('smoothWheel: a wheel glides the page instead of jumping; reduced motion keeps it native', async () => {
    const page = await pageWith(browser, code, TALL)
    const glided = await page.evaluate(async () => {
      const w = window as any
      w.theater.smoothWheel({ signal: new AbortController().signal })
      const wheel = new WheelEvent('wheel', {
        deltaY: 400,
        cancelable: true,
        bubbles: true,
      })
      document.body.dispatchEvent(wheel)
      await new Promise(requestAnimationFrame)
      const first = scrollY
      for (let i = 0; i < 60; i++) await new Promise(requestAnimationFrame)
      return { prevented: wheel.defaultPrevented, first, last: scrollY }
    })
    expect(glided.prevented).toBe(true)
    expect(glided.first).toBeGreaterThan(0)
    expect(glided.first).toBeLessThan(400)
    expect(glided.last).toBeCloseTo(400, 0)
    const calm = await pageWith(browser, code, TALL, (p) =>
      p.emulateMedia({ reducedMotion: 'reduce' }),
    )
    const native = await calm.evaluate(() => {
      ;(window as any).theater.smoothWheel({
        signal: new AbortController().signal,
      })
      const wheel = new WheelEvent('wheel', {
        deltaY: 400,
        cancelable: true,
        bubbles: true,
      })
      document.body.dispatchEvent(wheel)
      return wheel.defaultPrevented
    })
    expect(native).toBe(false)
  })
})
