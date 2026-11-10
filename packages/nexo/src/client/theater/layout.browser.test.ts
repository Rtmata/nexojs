/** FLIP (E.1), `For` moves (E.2) and shared elements (E.3) in Chrome. */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { chromium, type Browser, type Page } from 'playwright'
import { bundle, chrome, clockedPage, pageWith } from './page.fixture'

let browser: Browser
let code: string

const ROWS =
  '<style>body, ul { margin: 0; padding: 0 } li { height: 50px; display: block } [data-moving] { transition: translate 400ms linear }</style><main id="host"></main>'

const top = (page: Page, id: string) =>
  page.evaluate(
    (id) => document.getElementById(id)!.getBoundingClientRect().top,
    id,
  )

describe.skipIf(!chrome)('layout in Chrome', () => {
  beforeAll(async () => {
    browser = await chromium.launch({ channel: 'chrome' })
    code = await bundle()
  })

  afterAll(async () => {
    await browser?.close()
  })

  test('layout: the moved element starts where it was and ends clean', async () => {
    const { page, clock } = await clockedPage(
      browser,
      code,
      '<style>body { margin: 0 }</style><p id="a" style="margin:0">a</p>',
    )
    await page.evaluate(() => {
      const a = document.getElementById('a')!
      ;(window as any).theater.layout(
        [a],
        () => (a.style.marginTop = '200px'),
        { duration: 400, easing: 'linear' },
      )
    })
    expect(await top(page, 'a')).toBeCloseTo(0, 0) // inverted: still where it was
    await clock.advance(200)
    expect(await top(page, 'a')).toBeCloseTo(100, 0)
    await clock.advance(220)
    expect(await top(page, 'a')).toBeCloseTo(200, 0)
    expect(
      await page.evaluate(() => document.getElementById('a')!.style.translate),
    ).toBe('')
  })

  test('measure before, flip after a change made elsewhere', async () => {
    const { page, clock } = await clockedPage(
      browser,
      code,
      '<style>body { margin: 0 }</style><p id="a" style="margin:0">a</p>',
    )
    await page.evaluate(() => {
      const { measure, flip } = (window as any).theater
      const a = document.getElementById('a')!
      const before = measure([a])
      a.style.marginTop = '100px'
      flip(before, { duration: 400, easing: 'linear' })
    })
    await clock.advance(200)
    expect(await top(page, 'a')).toBeCloseTo(50, 0)
  })

  test('<For move>: CSS slides reordered rows home', async () => {
    const { page, clock } = await clockedPage(browser, code, ROWS)
    await page.evaluate(() => {
      const w = window as any
      w.setRows = w.theater.list(
        document.getElementById('host'),
        [1, 2, 3],
        true,
      )
      w.setRows([3, 1, 2])
    })
    const moving = await page.evaluate(() =>
      document.getElementById('n3')!.hasAttribute('data-moving'),
    )
    expect(moving).toBe(true)
    expect(await top(page, 'n3')).toBeCloseTo(100, 0) // still where it was
    await clock.advance(200)
    expect(await top(page, 'n3')).toBeCloseTo(50, 0)
    await clock.advance(220)
    expect(await top(page, 'n3')).toBeCloseTo(0, 0)
    expect(
      await page.evaluate(() =>
        document.getElementById('n3')!.hasAttribute('data-moving'),
      ),
    ).toBe(false)
  })

  test('<For move={moves(…)}>: theater slides them with its curve', async () => {
    const { page, clock } = await clockedPage(browser, code, ROWS)
    await page.evaluate(() => {
      const w = window as any
      const { list, moves } = w.theater
      w.setRows = list(
        document.getElementById('host'),
        [1, 2, 3],
        moves({ duration: 400, easing: 'linear' }),
      )
      w.setRows([3, 1, 2])
    })
    await clock.advance(200)
    expect(await top(page, 'n3')).toBeCloseTo(50, 0)
    expect(await top(page, 'n1')).toBeCloseTo(25, 0)
  })

  test('animateView: shared elements fly; theater gives the curve', async () => {
    const page = await pageWith(
      browser,
      code,
      '<p id="a" style="view-transition-name: cover; margin: 0; width: 100px; height: 100px">a</p>',
    )
    const parts = await page.evaluate(async () => {
      const w = window as any
      const done = w.theater.animateView(
        () => {
          document.getElementById('a')!.style.marginTop = '300px'
        },
        { duration: 700, easing: 'linear' },
      )
      const isCover = (a: Animation) =>
        (a.effect as KeyframeEffect).pseudoElement?.startsWith(
          '::view-transition-group(cover',
        )
      // headless Chrome takes about a second to start its first View Transition
      for (let i = 0; i < 300 && !document.getAnimations().some(isCover); i++)
        await new Promise(requestAnimationFrame)
      await new Promise(requestAnimationFrame)
      const timings = document
        .getAnimations()
        .filter((a) =>
          (a.effect as KeyframeEffect).pseudoElement?.startsWith(
            '::view-transition-group(cover',
          ),
        )
        .map((a) => a.effect!.getTiming())
      await done
      return timings.map((t) => [t.duration, t.easing])
    })
    expect(parts.length).toBeGreaterThan(0)
    expect(parts[0]).toEqual([700, 'linear'])
  })

  test('animateView without View Transitions: the named element FLIPs (R.5)', async () => {
    const page = await pageWith(
      browser,
      code,
      '<style>body { margin: 0 }</style><p id="a" style="view-transition-name: cover; margin: 0">a</p>',
    )
    const result = await page.evaluate(async () => {
      delete (Document.prototype as any).startViewTransition // a browser without them
      const a = document.getElementById('a')!
      ;(window as any).theater.animateView(
        () => (a.style.marginTop = '300px'),
        { duration: 400, easing: 'linear' },
      )
      await new Promise((r) => setTimeout(r, 20))
      return {
        flipping: a.getAnimations().length,
        top: a.getBoundingClientRect().top,
      }
    })
    expect(result.flipping).toBe(1)
    expect(result.top).toBeLessThan(300)
  })

  test('animateView under reduced motion: the change just happens', async () => {
    const page = await pageWith(
      browser,
      code,
      '<p id="a" style="view-transition-name: cover">a</p>',
      (p) => p.emulateMedia({ reducedMotion: 'reduce' }),
    )
    const count = await page.evaluate(async () => {
      const a = document.getElementById('a')!
      await (window as any).theater.animateView(
        () => (a.style.marginTop = '300px'),
      )
      return document.getAnimations().length
    })
    expect(count).toBe(0)
  })
})
