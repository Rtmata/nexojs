/** `tween` in Chrome, on the test clock: a new target starts from where it is, at the speed it has. */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { chromium, type Browser } from 'playwright'
import { bundle, chrome, clockedPage } from './page.fixture'

let browser: Browser
let code: string

describe.skipIf(!chrome)('tween in Chrome', () => {
  beforeAll(async () => {
    browser = await chromium.launch({ channel: 'chrome' })
    code = await bundle()
  })

  afterAll(async () => {
    await browser?.close()
  })

  test('a value: the start is written at once; a new target starts from where it is', async () => {
    const { page, clock } = await clockedPage(browser, code, '')
    const first = await page.evaluate(() => {
      const w = window as any
      w.seen = []
      w.t = w.theater.tween((v: number) => w.seen.push(v), 0, {
        duration: 160,
        easing: 'linear',
      })
      w.t.set(100)
      return w.seen[0]
    })
    await clock.advance(80)
    const before = await page.evaluate(() => (window as any).seen.at(-1))
    await page.evaluate(() => (window as any).t.set(0))
    await clock.advance(16)
    const after = await page.evaluate(() => (window as any).seen.at(-1))
    expect(first).toBe(0)
    expect(after).toBeLessThan(before)
    expect(before - after).toBeLessThan(20) // no jump back to 100 or to 0
  })

  test('a value with a spring keeps its speed when the target moves on', async () => {
    const { page, clock } = await clockedPage(browser, code, '')
    await page.evaluate(() => {
      const w = window as any
      w.seen = []
      w.t = w.theater.tween((v: number) => w.seen.push(v), 0, {
        spring: { duration: 400 },
      })
      w.t.set(100)
    })
    await clock.advance(96)
    const speedBefore = await page.evaluate(() => {
      const s = (window as any).seen
      return s.at(-1) - s.at(-2)
    })
    await page.evaluate(() => (window as any).t.set(200))
    await clock.advance(16)
    const speedAfter = await page.evaluate(() => {
      const s = (window as any).seen
      return s.at(-1) - s.at(-2)
    })
    expect(speedAfter).toBeGreaterThan(speedBefore * 0.6)
  })

  test('an element: the start goes inline; a new target starts from what is shown', async () => {
    const { page, clock } = await clockedPage(browser, code, '<p id="a">a</p>')
    const start = await page.evaluate(() => {
      const w = window as any
      w.t = w.theater.tween(
        document.getElementById('a'),
        { opacity: 0 },
        { duration: 400, easing: 'linear' },
      )
      const inline = document.getElementById('a')!.getAttribute('style')
      w.t.set({ opacity: 1 })
      return inline
    })
    await clock.advance(200)
    await page.evaluate(() => (window as any).t.set({ opacity: 0 }))
    await clock.advance(16)
    const opacity = await page.evaluate(() =>
      Number(getComputedStyle(document.getElementById('a')!).opacity),
    )
    expect(start).toBe('opacity: 0;')
    expect(opacity).toBeGreaterThan(0.4)
    expect(opacity).toBeLessThan(0.5)
    expect(
      await page.evaluate(
        () => document.getElementById('a')!.getAnimations().length,
      ),
    ).toBe(1)
  })

  test('an element with a spring keeps its speed (a single-number property)', async () => {
    const { page, clock } = await clockedPage(browser, code, '<p id="a">a</p>')
    const scale = () =>
      page.evaluate(() =>
        Number(getComputedStyle(document.getElementById('a')!).scale),
      )
    await page.evaluate(() => {
      const w = window as any
      w.t = w.theater.tween(
        document.getElementById('a'),
        { scale: 1 },
        { spring: { duration: 400 } },
      )
      w.t.set({ scale: 2 })
    })
    await clock.advance(80)
    const a = await scale()
    await clock.advance(16)
    const b = await scale()
    await page.evaluate(() => (window as any).t.set({ scale: 3 }))
    await clock.advance(16)
    const c = await scale()
    expect(c - b).toBeGreaterThan((b - a) * 0.6)
  })
})
