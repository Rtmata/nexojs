/**
 * theater in a real browser, for what only a browser has: computed styles,
 * media queries, animation frames and element animations. The pieces are
 * bundled once and imported into each page as `window.theater`.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { chromium, type Browser } from 'playwright'
import { testClock } from '../../shared/theater/test-clock'
import { bundle, chrome, pageWith as openPage } from './page.fixture'

if (!chrome) console.warn('theater: browser tests skipped, no Chrome found')

let browser: Browser
let code: string

describe.skipIf(!chrome)('theater in Chrome', () => {
  beforeAll(async () => {
    browser = await chromium.launch({ channel: 'chrome' })
    code = await bundle()
  })

  afterAll(async () => {
    await browser?.close()
  })

  test('speed: set on an ancestor, read below it; 1 when nobody set it', async () => {
    const page = await openPage(
      browser,
      code,
      '<main><p id="p">hi</p></main><aside id="a"></aside>',
    )
    const result = await page.evaluate(() => {
      const { setSpeed, speedOf } = (window as any).theater
      setSpeed(document.querySelector('main'), 0.5)
      return [
        speedOf(document.getElementById('p')),
        speedOf(document.getElementById('a')),
      ]
    })
    expect(result).toEqual([0.5, 1])
  })

  test('speed: a wrong value in CSS says what a speed is', async () => {
    const page = await openPage(
      browser,
      code,
      '<p id="p" style="--theater-speed: fast">hi</p>',
    )
    const message = await page.evaluate(() => {
      try {
        ;(window as any).theater.speedOf(document.getElementById('p'))
      } catch (error) {
        return (error as Error).message
      }
    })
    expect(message).toContain('theater: a speed is a positive number')
  })

  test('reducedMotion reads the preference live', async () => {
    const page = await openPage(browser, code, '')
    const before = await page.evaluate(() =>
      (window as any).theater.reducedMotion(),
    )
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const after = await page.evaluate(() =>
      (window as any).theater.reducedMotion(),
    )
    expect([before, after]).toEqual([false, true])
  })

  test('frames() runs jobs on animation frames and sleeps after', async () => {
    const page = await openPage(browser, code, '')
    const result = await page.evaluate(async () => {
      const loop = (window as any).theater.frames()
      const stop = new AbortController()
      let runs = 0
      loop.every('update', () => ++runs === 3 && stop.abort(), {
        signal: stop.signal,
      })
      for (let i = 0; i < 5; i++) await new Promise(requestAnimationFrame)
      return { runs, size: loop.size }
    })
    expect(result).toEqual({ runs: 3, size: 0 })
  })

  test('testClock moves WAAPI and CSS animations together, frame by frame', async () => {
    let clock!: Awaited<ReturnType<typeof testClock>>
    const css =
      '<style>@keyframes rise { from { translate: 0 40px } to { translate: 0 0 } } #b { animation: rise 400ms linear }</style>'
    const page = await openPage(
      browser,
      code,
      `${css}<p id="a">a</p><p id="b">b</p>`,
      async (p) => {
        clock = await testClock(p)
      },
    )
    await page.evaluate(() => {
      document
        .getElementById('a')!
        .animate({ opacity: [0, 1] }, { duration: 400 })
    })
    await clock.advance(200)
    const mid = await page.evaluate(() => [
      Number(getComputedStyle(document.getElementById('a')!).opacity),
      getComputedStyle(document.getElementById('b')!).translate,
    ])
    expect(mid[0]).toBeCloseTo(0.5, 1)
    expect(mid[1]).toBe('0px 20px')
  })

  test('testClock finishes animations at their end, so finished resolves', async () => {
    let clock!: Awaited<ReturnType<typeof testClock>>
    const page = await openPage(browser, code, '<p id="a">a</p>', async (p) => {
      clock = await testClock(p)
    })
    await page.evaluate(() => {
      const a = document.getElementById('a')!.animate({ opacity: [0, 1] }, 300)
      a.finished.then(() => ((window as any).done = true))
    })
    await clock.advance(320)
    expect(await page.evaluate(() => (window as any).done)).toBe(true)
  })

  test('testClock leaves an animation the page paused alone', async () => {
    let clock!: Awaited<ReturnType<typeof testClock>>
    const page = await openPage(browser, code, '<p id="a">a</p>', async (p) => {
      clock = await testClock(p)
    })
    await page.evaluate(() => {
      const a = document.getElementById('a')!.animate({ opacity: [0, 1] }, 400)
      a.currentTime = 100
      a.pause()
    })
    await clock.advance(200)
    const time = await page.evaluate(
      () => document.getElementById('a')!.getAnimations()[0]!.currentTime,
    )
    expect(time).toBe(100)
  })

  test('testClock drives theater frame loop too', async () => {
    let clock!: Awaited<ReturnType<typeof testClock>>
    const page = await openPage(browser, code, '', async (p) => {
      clock = await testClock(p)
    })
    await page.evaluate(() => {
      const w = window as any
      w.elapsed = 0
      w.theater
        .frames()
        .every(
          'update',
          ({ delta }: { delta: number }) => (w.elapsed += delta),
          { signal: new AbortController().signal },
        )
    })
    await clock.advance(160)
    const elapsed = await page.evaluate(() => (window as any).elapsed)
    expect(elapsed).toBeGreaterThan(130)
    expect(elapsed).toBeLessThan(180)
  })

  test('benchmark: value springs per frame fit in the 16 ms budget (item 33)', async () => {
    const page = await openPage(browser, code, '')
    const result = await page.evaluate(async () => {
      const { frames, SpringCurve } = (window as any).theater
      const curve = new SpringCurve({ duration: 400, bounce: 0.3 })
      const measure = async (count: number) => {
        const values = new Float64Array(count)
        const stop = new AbortController()
        const times: number[] = []
        frames().every(
          'update',
          ({ now }: { now: number }) => {
            const start = performance.now()
            for (let i = 0; i < count; i++)
              values[i] = curve.at((now + i) % curve.duration)
            times.push(performance.now() - start)
            if (times.length === 30) stop.abort()
          },
          { signal: stop.signal },
        )
        while (!stop.signal.aborted) await new Promise(requestAnimationFrame)
        return times.sort((a, b) => a - b)[15]!
      }
      return {
        thousand: await measure(1000),
        tenThousand: await measure(10000),
      }
    })
    console.log(
      `theater benchmark (median ms per frame): 1 000 springs ${result.thousand.toFixed(2)}, 10 000 springs ${result.tenThousand.toFixed(2)}`,
    )
    expect(result.thousand).toBeLessThan(16)
  })
})
