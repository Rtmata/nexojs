/** `drag` in Chrome, with Playwright's mouse on the test clock. */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { chromium, type Browser, type Page } from 'playwright'
import type { TestClock } from '../../shared/theater/test-clock'
import { bundle, chrome, clockedPage } from './page.fixture'

let browser: Browser
let code: string

const PAGE =
  '<style>body { margin: 0 } #shelf { width: 300px; height: 100px; background: #ccc }</style><div id="shelf"><a id="game" href="#game">game</a></div>'

const translate = (page: Page) =>
  page.evaluate(
    () => getComputedStyle(document.getElementById('shelf')!).translate,
  )

/** Drags from (150, 50) by `dx`, 10 px per 16 ms frame. */
async function dragBy(page: Page, clock: TestClock, dx: number): Promise<void> {
  await page.mouse.move(150, 50)
  await page.mouse.down()
  const steps = Math.abs(dx) / 10
  for (let i = 1; i <= steps; i++) {
    await clock.advance(16)
    await page.mouse.move(150 + Math.sign(dx) * i * 10, 50)
  }
}

describe.skipIf(!chrome)('drag in Chrome', () => {
  beforeAll(async () => {
    browser = await chromium.launch({ channel: 'chrome' })
    code = await bundle()
  })

  afterAll(async () => {
    await browser?.close()
  })

  test('it follows the pointer, and past a bound only part of the way', async () => {
    const { page, clock } = await clockedPage(browser, code, PAGE)
    await page.evaluate(() =>
      (window as any).theater.drag(document.getElementById('shelf'), {
        axis: 'x',
        bounds: { min: -400, max: 0 },
      }),
    )
    await dragBy(page, clock, -100)
    expect(await translate(page)).toBe('-100px')
    await page.mouse.move(150 + 100, 50) // 100 px past max = 0
    expect(await translate(page)).toBe('35px') // elastic 0.35
    await page.mouse.up()
  })

  test('released, it keeps the pointer speed and stops on the snap grid', async () => {
    const { page, clock } = await clockedPage(browser, code, PAGE)
    await page.evaluate(() => {
      const w = window as any
      w.d = w.theater.drag(document.getElementById('shelf'), {
        axis: 'x',
        bounds: { min: -2000, max: 0 },
        release: {
          inertia: { snap: (x: number) => Math.round(x / 220) * 220 },
        },
      })
    })
    await dragBy(page, clock, -100) // 625 px/s
    await page.mouse.up()
    await clock.advance(6000)
    const x = await page.evaluate(() => (window as any).d.x)
    expect(x).toBeLessThan(-100) // it kept going
    expect(Math.abs(x % 220)).toBeLessThan(1) // and rests on the grid
  })

  test('a drag swallows its click; a tap is still a click', async () => {
    const { page, clock } = await clockedPage(browser, code, PAGE)
    await page.evaluate(() => {
      const w = window as any
      w.clicks = 0
      document
        .getElementById('game')!
        .addEventListener('click', (e) => (e.preventDefault(), w.clicks++))
      w.theater.drag(document.getElementById('shelf'), { axis: 'x' })
    })
    const box = (await page.locator('#game').boundingBox())!
    await page.mouse.move(box.x + 5, box.y + 5)
    await page.mouse.down()
    await clock.advance(16)
    await page.mouse.move(box.x + 60, box.y + 5)
    await page.mouse.up()
    await clock.advance(16) // the swallow is for the drag's own click: gone by the next task
    const now = (await page.locator('#game').boundingBox())! // the drag moved it
    await page.mouse.click(now.x + 5, now.y + 5) // by coordinates: under the test clock no frame comes to call it "stable"
    expect(await page.evaluate(() => (window as any).clicks)).toBe(1)
  })

  test('set moves it without dragging (WCAG 2.5.7)', async () => {
    const { page, clock } = await clockedPage(browser, code, PAGE)
    await page.evaluate(() => {
      const w = window as any
      w.d = w.theater.drag(document.getElementById('shelf'), { axis: 'x' })
      w.d.set({ x: -220 }, { duration: 200, easing: 'linear' })
    })
    await clock.advance(100)
    const mid = Number((await translate(page)).replace('px', ''))
    expect(Math.abs(mid + 110)).toBeLessThan(6) // within a frame
    await clock.advance(120)
    expect(await translate(page)).toBe('-220px')
  })

  test('wrong options say what they take', async () => {
    const { page } = await clockedPage(browser, code, PAGE)
    const errors = await page.evaluate(() => {
      const { drag } = (window as any).theater
      const shelf = document.getElementById('shelf')
      const thrown = (options: object) => {
        try {
          drag(shelf, options)
        } catch (error) {
          return (error as Error).name
        }
      }
      return [
        thrown({ axis: 'X' }),
        thrown({ elastic: 2 }),
        thrown({ elastic: NaN }),
        thrown({ bounds: { min: 10, max: 0 } }),
        thrown({ bounds: { x: { min: NaN } } }),
      ]
    })
    expect(errors).toEqual(Array(5).fill('RangeError'))
  })

  test('set refuses a key it would not move, and a place that is not a number', async () => {
    const { page } = await clockedPage(browser, code, PAGE)
    const errors = await page.evaluate(() => {
      const shelf = document.getElementById('shelf')
      const d = (window as any).theater.drag(shelf, { axis: 'x' })
      const thrown = (to: object) => {
        try {
          d.set(to)
        } catch (error) {
          return (error as Error).name
        }
      }
      return [thrown({ left: 10 }), thrown({ y: 10 }), thrown({ x: NaN })]
    })
    expect(errors).toEqual(['TypeError', 'TypeError', 'RangeError'])
  })

  test('aborted mid-drag, it is no longer marked as dragging', async () => {
    const { page, clock } = await clockedPage(browser, code, PAGE)
    await page.evaluate(() => {
      const w = window as any
      w.stop = new AbortController()
      w.theater.drag(document.getElementById('shelf'), {
        axis: 'x',
        signal: w.stop.signal,
      })
    })
    await dragBy(page, clock, -50)
    const dragging = () =>
      page.evaluate(() =>
        document.getElementById('shelf')!.hasAttribute('data-dragging'),
      )
    expect(await dragging()).toBe(true)
    await page.evaluate(() => (window as any).stop.abort())
    expect(await dragging()).toBe(false)
    await page.mouse.up()
  })

  test('under reduced motion the release jumps to where it would rest', async () => {
    const { page, clock } = await clockedPage(browser, code, PAGE)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.evaluate(() => {
      const w = window as any
      w.d = w.theater.drag(document.getElementById('shelf'), {
        axis: 'x',
        release: { inertia: { snap: [0, -220, -440] } },
      })
    })
    await dragBy(page, clock, -100)
    await page.mouse.up()
    await clock.advance(16)
    expect([-220, -440, 0]).toContain(
      await page.evaluate(() => (window as any).d.x),
    )
  })
})
