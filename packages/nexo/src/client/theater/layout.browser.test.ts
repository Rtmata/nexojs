/** FLIP, `For` moves and shared elements in Chrome. */
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

  test('layout: an inline translate set before (a drag) is there again at the end', async () => {
    const { page, clock } = await clockedPage(
      browser,
      code,
      '<style>body { margin: 0 }</style><p id="a" style="margin:0; translate: 30px 0">a</p>',
    )
    await page.evaluate(() => {
      const a = document.getElementById('a')!
      ;(window as any).theater.layout(
        [a],
        () => (a.style.marginTop = '200px'),
        { duration: 400, easing: 'linear' },
      )
    })
    await clock.advance(420)
    const style = await page.evaluate(() => {
      const { translate, scale } = document.getElementById('a')!.style
      return [translate, scale]
    })
    expect(style).toEqual(['30px', ''])
  })

  test('layout: a drag moving during the FLIP is added to it, and its latest place stays', async () => {
    const { page, clock } = await clockedPage(
      browser,
      code,
      '<style>body { margin: 0 }</style><p id="a" style="margin:0; translate: 30px 0">a</p>',
    )
    await page.evaluate(() => {
      const a = document.getElementById('a')!
      ;(window as any).theater.layout(
        [a],
        () => (a.style.marginTop = '200px'),
        { duration: 400, easing: 'linear' },
      )
    })
    await clock.advance(200)
    await page.evaluate(
      () => (document.getElementById('a')!.style.translate = '80px 0'),
    )
    await clock.advance(16)
    const left = await page.evaluate(
      () => document.getElementById('a')!.getBoundingClientRect().left,
    )
    expect(left).toBeCloseTo(80, 0) // the drag shows through: the FLIP only adds its vertical offset
    await clock.advance(220)
    expect(
      await page.evaluate(() => document.getElementById('a')!.style.translate),
    ).toBe('80px')
  })

  test('layout under reduced motion: no FLIP, and a drag or stylesheet offset is left alone', async () => {
    const { page } = await clockedPage(
      browser,
      code,
      '<style>body { margin: 0 } #a { scale: 2 }</style><p id="a" style="margin:0; translate: 30px 0">a</p>',
    )
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const style = await page.evaluate(async () => {
      const a = document.getElementById('a')!
      await (window as any).theater.layout(
        [a],
        () => (a.style.marginTop = '200px'),
      ).finished
      return [a.style.translate, a.style.scale, getComputedStyle(a).scale]
    })
    expect(style).toEqual(['30px', '', '2'])
  })

  test('reduced motion: an added move jumps to its end on top of what is under it', async () => {
    const { page, clock } = await clockedPage(
      browser,
      code,
      '<style>body { margin: 0 }</style><p id="a" style="margin:0; translate: 30px 0">a</p>',
    )
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.evaluate(() => {
      const a = document.getElementById('a')!
      ;(window as any).theater.animate(
        a,
        { translate: ['0px 0px', '100px 0px'] },
        { composite: 'add' },
      )
    })
    await clock.advance(16)
    const left = await page.evaluate(
      () => document.getElementById('a')!.getBoundingClientRect().left,
    )
    expect(left).toBeCloseTo(130, 0)
  })

  test('composite reaches WAAPI on elements; on a value it is refused', async () => {
    const { page } = await clockedPage(browser, code, '<p id="a">a</p>')
    const result = await page.evaluate(() => {
      const t = (window as any).theater
      const a = t.animate(
        document.getElementById('a'),
        { opacity: [0, 1] },
        { composite: 'add' },
      )
      let refused = ''
      try {
        t.animate([0, 1], () => {}, { composite: 'add' })
      } catch (error) {
        refused = (error as Error).name
      }
      return [a.effect.composite, refused]
    })
    expect(result).toEqual(['add', 'TypeError'])
  })

  test('layout: a newer FLIP of the same element takes over from where it is', async () => {
    const { page, clock } = await clockedPage(
      browser,
      code,
      '<style>body { margin: 0 }</style><p id="a" style="margin:0">a</p>',
    )
    const move = (top: number) =>
      page.evaluate((top) => {
        const a = document.getElementById('a')!
        ;(window as any).theater.layout(
          [a],
          () => (a.style.marginTop = `${top}px`),
          { duration: 400, easing: 'linear' },
        )
      }, top)
    await move(200)
    await clock.advance(200) // halfway: seen at 100
    await move(0)
    expect(
      await page.evaluate(
        () => document.getElementById('a')!.getAnimations().length,
      ),
    ).toBe(1)
    expect(await top(page, 'a')).toBeCloseTo(100, 0)
    await clock.advance(420)
    expect(await top(page, 'a')).toBeCloseTo(0, 0)
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

  test('animateView without View Transitions: the named element FLIPs', async () => {
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

  test('animateView: a skipped transition still counts, and nothing goes unhandled', async () => {
    const page = await pageWith(
      browser,
      code,
      '<p id="a" style="view-transition-name: cover; margin: 0">a</p>',
    )
    const result = await page.evaluate(async () => {
      const w = window as any
      let unhandled = 0
      addEventListener('unhandledrejection', () => unhandled++)
      const a = document.getElementById('a')!
      const done = w.theater.animateView(() => (a.style.marginTop = '300px'), {
        duration: 700,
      })
      const newer = document.startViewTransition(() => {}) // skips the first
      await newer.finished
      const outcome = await done.then(
        () => 'resolved',
        (error: Error) => error.name,
      )
      const failed = await w.theater
        .animateView(() => {
          throw new Error('change broke')
        })
        .catch((error: Error) => error.message)
      for (let i = 0; i < 5; i++) await new Promise(requestAnimationFrame)
      return { outcome, moved: a.style.marginTop, failed, unhandled }
    })
    expect(result).toEqual({
      outcome: 'resolved',
      moved: '300px',
      failed: 'change broke',
      unhandled: 0,
    })
  })

  test('animateView without View Transitions: an aborted FLIP still resolves', async () => {
    const page = await pageWith(
      browser,
      code,
      '<style>body { margin: 0 }</style><p id="a" style="view-transition-name: cover; margin: 0">a</p>',
    )
    const outcome = await page.evaluate(async () => {
      delete (Document.prototype as any).startViewTransition
      const a = document.getElementById('a')!
      const stop = new AbortController()
      const done = (window as any).theater.animateView(
        () => (a.style.marginTop = '300px'),
        { duration: 400, signal: stop.signal },
      )
      await new Promise((r) => setTimeout(r, 20))
      stop.abort()
      return done.then(
        () => 'resolved',
        (error: Error) => error.name,
      )
    })
    expect(outcome).toBe('resolved')
  })

  test('animateView without view-transition-name either: reported once', async () => {
    const page = await pageWith(
      browser,
      code,
      '<p id="a" style="margin: 0">a</p>',
    )
    const reported = await page.evaluate(async () => {
      delete (Document.prototype as any).startViewTransition
      const supports = CSS.supports.bind(CSS) as (...a: string[]) => boolean
      CSS.supports = ((...a: string[]) =>
        a[0] !== 'view-transition-name' && supports(...a)) as any
      const errors: string[] = []
      addEventListener('error', (e) => errors.push((e as ErrorEvent).message))
      const a = document.getElementById('a')!
      const { animateView } = (window as any).theater
      await animateView(() => (a.style.marginTop = '100px'))
      await animateView(() => (a.style.marginTop = '200px'))
      return { errors, moved: a.style.marginTop }
    })
    expect(reported.errors).toHaveLength(1)
    expect(reported.errors[0]).toContain('theater: animateView:')
    expect(reported.moved).toBe('200px')
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
