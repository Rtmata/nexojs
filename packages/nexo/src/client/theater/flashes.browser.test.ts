/** The flash checker in Chrome: predicted from keyframes, measured from frames. */
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

  test('predicted: a transparent body is the canvas white, and a transparent element shows it', async () => {
    const page = await pageWith(
      browser,
      code,
      '<style>body { margin: 0 } @keyframes blink { 50% { background: #000 } } #b { width: 900px; height: 900px; animation: blink 200ms steps(1) infinite }</style><div id="b"></div>',
    )
    const found = await page.evaluate(() =>
      (window as any).theater
        .predictFlashes()
        .map((f: any) => [f.perSecond, f.fails]),
    )
    expect(found).toEqual([[5, true]])
  })

  test('predicted: a keyframe colour is composited by its alpha over the page', async () => {
    const page = await pageWith(browser, code, '<div id="b"></div>')
    const found = await page.evaluate(() => {
      const b = document.getElementById('b')!
      b.style.cssText = 'width: 900px; height: 900px'
      const step = { easing: 'steps(1)' }
      b.animate(
        [
          { backgroundColor: 'rgb(0 0 0 / 0)', ...step },
          { backgroundColor: 'rgb(0 0 0 / 1)', offset: 0.5, ...step },
          { backgroundColor: 'rgb(0 0 0 / 1)' },
        ],
        { duration: 200, iterations: Infinity },
      )
      return (window as any).theater.predictFlashes()[0].perSecond
    })
    expect(found).toBe(5)
  })

  test('predicted: 1.5 iterations end halfway through the second, as WAAPI does', async () => {
    const page = await pageWith(browser, code, '<div id="b"></div>')
    const found = await page.evaluate(() => {
      const b = document.getElementById('b')!
      b.style.cssText = 'width: 900px; height: 900px'
      const step = { easing: 'steps(1)' }
      const blink = b.animate(
        [
          { backgroundColor: '#000', ...step },
          { backgroundColor: '#fff', offset: 0.5, ...step },
          { backgroundColor: '#fff' },
        ],
        { duration: 200, iterations: 1.5, fill: 'forwards' },
      )
      const progressAt = (ms: number) => (
        (blink.currentTime = ms),
        blink.effect!.getComputedTiming().progress
      )
      const progress = [progressAt(250), progressAt(1000)]
      blink.currentTime = 0
      return {
        progress,
        perSecond: (window as any).theater.predictFlashes()[0].perSecond,
      }
    })
    expect(found.progress[0]).toBeCloseTo(0.25, 9) // black again
    expect(found.progress[1]).toBeCloseTo(0.5, 9) // then held white
    expect(found.perSecond).toBe(1) // black, white, black, white: one flash
  })

  test('predicted: currentcolor is the text colour; a value that is no colour is reported, the background used', async () => {
    const page = await pageWith(browser, code, '<div id="b"></div>')
    const found = await page.evaluate(() => {
      const reported: string[] = []
      const onError = (e: ErrorEvent) => (
        reported.push(e.error?.message ?? e.message),
        e.preventDefault()
      )
      window.addEventListener('error', onError)
      const b = document.getElementById('b')!
      b.style.cssText = 'width: 900px; height: 900px; color: #fff'
      const blink = (color: string) =>
        b.animate(
          [
            { backgroundColor: color, easing: 'steps(1)' },
            { backgroundColor: '#000', offset: 0.5, easing: 'steps(1)' },
            { backgroundColor: '#000' },
          ],
          { duration: 200, iterations: Infinity },
        )
      blink('currentcolor')
      blink('var(--nowhere)')
      const counts = (window as any).theater
        .predictFlashes()
        .map((f: any) => f.perSecond)
      window.removeEventListener('error', onError)
      return { counts, reported }
    })
    expect(found.counts).toEqual([5, 5])
    expect(found.reported).toEqual([
      "theater: predictFlashes: var(--nowhere) is not a colour; the element's background is used",
    ])
  })

  test('measured: the real frames of a big blinking block fail; a still page passes', async () => {
    const { page, clock } = await clockedPage(browser, code, blinking(5, 2000))
    const report = await flashes(page, { seconds: 2, clock })
    expect(report.failures.length).toBeGreaterThan(0)
    const calm = await clockedPage(browser, code, '<p>still</p>')
    expect(
      (await flashes(calm.page, { seconds: 1, clock: calm.clock })).failures,
    ).toEqual([])
  }, 120_000) // a screenshot per frame: the faithful source is the slow one

  test('measured: a region is averaged in linear light (fine black and white stripes are not sRGB 127)', async () => {
    const stripes =
      '<style>body { margin: 0 } @keyframes blink { 50% { background: #7f7f7f } } #b { width: 2000px; height: 2000px; background: repeating-linear-gradient(90deg, #000 0 2px, #fff 2px 4px); animation: blink 200ms steps(1) infinite }</style><div id="b"></div>'
    const { page, clock } = await clockedPage(browser, code, stripes)
    const report = await flashes(page, { seconds: 1, clock })
    expect(report.failures.length).toBe(9)
  }, 120_000)
})
