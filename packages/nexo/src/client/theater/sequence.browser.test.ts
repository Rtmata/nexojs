/** Sequences (B.2, B.2b) and stagger in Chrome, on the test clock. */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { chromium, type Browser, type Page } from 'playwright'
import { bundle, chrome, clockedPage } from './page.fixture'

let browser: Browser
let code: string

const ROOM =
  '<h1 id="title">Arcade</h1><ul id="shelves"><li>1</li></ul><output id="count"></output>'

/** The room of the B.2 preview: title, shelves 200 ms after it starts, counter 100 ms before they end. */
function enterRoom(page: Page): Promise<number> {
  return page.evaluate(() => {
    const w = window as any
    const $ = (id: string) => document.getElementById(id)!
    w.room = w.theater.animate([
      [$('title'), { opacity: [0, 1] }, { duration: 300, easing: 'linear' }],
      [
        $('shelves'),
        { translate: ['0 40px', '0 0'] },
        { duration: 400, easing: 'linear', with: 'previous', delay: 200 },
      ],
      [
        [0, 1200],
        (n: number) => ($('count').textContent = String(Math.round(n))),
        { duration: 800, easing: 'linear', delay: -100 },
      ],
    ])
    return w.room.duration
  })
}

const opacity = (page: Page) =>
  page.evaluate(() =>
    Number(getComputedStyle(document.getElementById('title')!).opacity),
  )
const translate = (page: Page) =>
  page.evaluate(
    () => getComputedStyle(document.getElementById('shelves')!).translate,
  )
const count = (page: Page) =>
  page.evaluate(() => Number(document.getElementById('count')!.textContent))

describe.skipIf(!chrome)('sequences in Chrome', () => {
  beforeAll(async () => {
    browser = await chromium.launch({ channel: 'chrome' })
    code = await bundle()
  })

  afterAll(async () => {
    await browser?.close()
  })

  test('segments are placed by B.2b: after, with previous + delay, a negative delay', async () => {
    const { page, clock } = await clockedPage(browser, code, ROOM)
    expect(await enterRoom(page)).toBe(1300)
    await clock.advance(100)
    expect(await translate(page)).toBe('0px 40px') // waits in its first state
    await clock.advance(450) // 550
    expect(await opacity(page)).toBe(1)
    expect(await translate(page)).toBe('0px 5px') // 350 of 400
    expect(await count(page)).toBeGreaterThan(50)
    expect(await count(page)).toBeLessThan(100) // 50 of 800
  })

  test('at its end every part is settled: inline styles, no animations left', async () => {
    const { page, clock } = await clockedPage(browser, code, ROOM)
    await enterRoom(page)
    await clock.advance(1340)
    const left = await page.evaluate(() => document.getAnimations().length)
    expect(left).toBe(0)
    expect(
      await page.evaluate(
        () => document.getElementById('title')!.style.opacity,
      ),
    ).toBe('1')
    expect(await count(page)).toBe(1200)
  })

  test('the whole sequence pauses, seeks and reverses as one', async () => {
    const { page, clock } = await clockedPage(browser, code, ROOM)
    await enterRoom(page)
    await page.evaluate(() => {
      const room = (window as any).room
      room.pause()
      room.currentTime = 450
    })
    expect(await opacity(page)).toBe(1)
    expect(await translate(page)).toBe('0px 15px') // 250 of 400
    await page.evaluate(() => (window as any).room.reverse())
    await clock.advance(304)
    expect(await opacity(page)).toBeCloseTo(0.5, 1) // 146 ms of the title left
  })

  test('labels: with a label starts where the segment before it ended', async () => {
    const { page, clock } = await clockedPage(
      browser,
      code,
      '<p id="a">a</p><p id="b">b</p>',
    )
    await page.evaluate(() => {
      const w = window as any
      const $ = (id: string) => document.getElementById(id)!
      w.theater.animate([
        [$('a'), { opacity: [0, 1] }, { duration: 200, easing: 'linear' }],
        'lights',
        [$('a'), { scale: [1, 2] }, { duration: 500, easing: 'linear' }],
        [
          $('b'),
          { opacity: [0, 1] },
          { duration: 200, easing: 'linear', with: 'lights' },
        ],
      ])
    })
    await clock.advance(300)
    const b = await page.evaluate(() =>
      Number(getComputedStyle(document.getElementById('b')!).opacity),
    )
    expect(b).toBeCloseTo(0.5, 1)
  })

  test('a nested sequence is one segment', async () => {
    const { page, clock } = await clockedPage(
      browser,
      code,
      '<p id="a">a</p><p id="b">b</p><p id="c">c</p>',
    )
    const duration = await page.evaluate(() => {
      const $ = (id: string) => document.getElementById(id)!
      const fade = (id: string) => [
        $(id),
        { opacity: [0, 1] },
        { duration: 100, easing: 'linear' },
      ]
      return (window as any).theater.animate([
        fade('a'),
        [[fade('b'), fade('c')]],
      ]).duration
    })
    expect(duration).toBe(300)
    await clock.advance(250)
    const c = await page.evaluate(() =>
      Number(getComputedStyle(document.getElementById('c')!).opacity),
    )
    expect(c).toBeCloseTo(0.5, 1)
  })

  test('aborting stops every part where it is', async () => {
    const { page, clock } = await clockedPage(browser, code, ROOM)
    await page.evaluate(() => ((window as any).stop = new AbortController()))
    await page.evaluate(() => {
      const w = window as any
      const $ = (id: string) => document.getElementById(id)!
      w.theater.animate(
        [
          [
            $('title'),
            { opacity: [0, 1] },
            { duration: 300, easing: 'linear' },
          ],
        ],
        { signal: w.stop.signal },
      )
    })
    await clock.advance(150)
    await page.evaluate(() => (window as any).stop.abort())
    await clock.advance(200)
    expect(await opacity(page)).toBeCloseTo(0.5, 1)
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0)
  })

  test('stagger: each element of a list starts later, from where it says', async () => {
    const { page, clock } = await clockedPage(
      browser,
      code,
      '<p class="c">1</p><p class="c">2</p><p class="c">3</p>',
    )
    await page.evaluate(() => {
      const w = window as any
      w.theater.animate(
        document.querySelectorAll('.c'),
        { opacity: [0, 1] },
        {
          duration: 200,
          easing: 'linear',
          delay: w.theater.stagger(100, { from: 'last' }),
        },
      )
    })
    await clock.advance(200)
    const opacities = await page.evaluate(() =>
      [...document.querySelectorAll('.c')].map((el) =>
        Number(getComputedStyle(el).opacity),
      ),
    )
    expect(opacities[0]).toBe(0)
    expect(opacities[1]).toBeCloseTo(0.5, 1)
    expect(opacities[2]).toBe(1)
  })

  test('a value segment is checked as animate checks a value', async () => {
    const { page } = await clockedPage(browser, code, '')
    const errors = await page.evaluate(() =>
      [
        [[5], () => {}],
        [[], () => {}],
        [[0, 1], () => {}, { iterations: Infinity }],
        [[0, 1], () => {}, { duration: NaN }],
      ].map((segment) => {
        try {
          ;(window as any).theater.animate([segment])
        } catch (error) {
          return (error as Error).name
        }
      }),
    )
    expect(errors).toEqual([
      'RangeError',
      'RangeError',
      'RangeError',
      'TypeError',
    ])
  })

  test("under reduced motion, a value segment with reduce: 'jump' ends at once", async () => {
    const { page } = await clockedPage(browser, code, '')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const value = await page.evaluate(() => {
      const w = window as any
      w.theater.animate([
        [
          [0, 100],
          (v: number) => (w.value = v),
          { duration: 400, reduce: 'jump' },
        ],
      ])
      return w.value
    })
    expect(value).toBe(100)
  })

  test('the page speed scales an inertia segment, delay and at, as it scales durations', async () => {
    const { page } = await clockedPage(browser, code, '<p id="a">a</p>')
    const lengths = await page.evaluate(() => {
      const { animate, setSpeed } = (window as any).theater
      const a = document.getElementById('a')!
      const fling = [[0], () => {}, { inertia: { velocity: 2000 } }]
      const fade = { opacity: [0, 1] }
      const measure = () => [
        animate([fling]).duration,
        animate([
          [a, fade, { duration: 400 }],
          [a, fade, { duration: 400, delay: 200 }],
        ]).duration,
        animate([[a, fade, { duration: 400, at: 1000 }]]).duration,
      ]
      const one = measure()
      setSpeed(document.documentElement, 2)
      return { one, two: measure() }
    })
    expect(lengths.two[0]).toBeCloseTo(lengths.one[0] / 2, 0)
    expect(lengths.one.slice(1)).toEqual([1000, 1400])
    expect(lengths.two.slice(1)).toEqual([500, 700])
  })

  test('an empty list of elements is a part that takes no time', async () => {
    const { page } = await clockedPage(browser, code, '<p id="a">a</p>')
    const duration = await page.evaluate(() => {
      const a = document.getElementById('a')!
      const fade = { opacity: [0, 1] }
      return (window as any).theater.animate([
        [a, fade, { duration: 100 }],
        [document.querySelectorAll('.none'), fade, { duration: 100 }],
        [[], fade],
        [a, fade, { duration: 100 }],
      ]).duration
    })
    expect(duration).toBe(200)
  })

  test('one part that cannot be settled is reported; the others still are', async () => {
    const { page, clock } = await clockedPage(
      browser,
      code,
      '<p id="a">a</p><p id="b">b</p>',
    )
    await page.evaluate(() => {
      const w = window as any
      const $ = (id: string) => document.getElementById(id)!
      w.errors = []
      addEventListener('error', (e: ErrorEvent) =>
        w.errors.push(e.error?.message),
      )
      const room = w.theater.animate([
        [$('a'), { opacity: [0, 1] }, { duration: 100 }],
        [$('b'), { opacity: [0, 1] }, { duration: 100, with: 'previous' }],
      ])
      room.members[0].commitStyles = () => {
        throw new Error('boom')
      }
    })
    await clock.advance(150)
    const seen = await page.evaluate(() => ({
      errors: (window as any).errors,
      b: document.getElementById('b')!.style.opacity,
      left: document.getElementById('b')!.getAnimations().length,
    }))
    expect(seen).toEqual({ errors: ['boom'], b: '1', left: 0 })
  })
})
