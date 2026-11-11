/** A value's `Animation` in Chrome, on the test clock: WAAPI's states, its `finished`, its errors. */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { chromium, type Browser, type Page } from 'playwright'
import { bundle, chrome, clockedPage } from './page.fixture'

let browser: Browser
let code: string

/** Starts `w.anim`: 0 → 100 over 100 ms, linear, its last write in `w.value`. */
function start(page: Page, extra: Record<string, unknown> = {}) {
  return page.evaluate((extra) => {
    const w = window as any
    w.anim = w.theater.animate([0, 100], (v: number) => (w.value = v), {
      duration: 100,
      easing: 'linear',
      ...extra,
    })
  }, extra)
}

/** What `w.anim.finished` is now: read in a later task, once it had time to settle. */
async function finishedState(page: Page): Promise<string> {
  await page.evaluate(() => {
    const w = window as any
    w.state = 'pending'
    w.anim.finished.then(
      () => (w.state = 'resolved'),
      (e: Error) => (w.state = `rejected: ${e.message}`),
    )
  })
  return page.evaluate(() => (window as any).state)
}

const read = (page: Page) =>
  page.evaluate(() => {
    const w = window as any
    return { state: w.anim.playState, value: w.value, time: w.anim.currentTime }
  })

describe.skipIf(!chrome)('a value animation in Chrome', () => {
  beforeAll(async () => {
    browser = await chromium.launch({ channel: 'chrome' })
    code = await bundle()
  })

  afterAll(async () => {
    await browser?.close()
  })

  test("after its end, finished stays resolved (WAAPI's), until it moves again", async () => {
    const { page, clock } = await clockedPage(browser, code, '')
    await start(page)
    await clock.advance(150)
    expect(await finishedState(page)).toBe('resolved')
    await page.evaluate(() => (window as any).anim.play())
    expect(await finishedState(page)).toBe('pending')
  })

  test("reduce: 'jump' finishes at once, and awaiting finished afterwards still resolves", async () => {
    const { page } = await clockedPage(browser, code, '')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await start(page, { reduce: 'jump' })
    expect(await read(page)).toMatchObject({ state: 'finished', value: 100 })
    expect(await finishedState(page)).toBe('resolved')
  })

  test("reduce: 'jump' ends even an endless one, as an element's does", async () => {
    const { page } = await clockedPage(browser, code, '')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await start(page, { reduce: 'jump', iterations: Infinity })
    expect(await read(page)).toMatchObject({ state: 'finished', value: 100 })
  })

  test('a write that throws ends it: finished rejects with that error, reported once', async () => {
    const { page, clock } = await clockedPage(browser, code, '')
    await page.evaluate(() => {
      const w = window as any
      w.errors = []
      addEventListener('error', (e: ErrorEvent) =>
        w.errors.push(e.error?.message),
      )
      w.writes = 0
      w.anim = w.theater.animate(
        [0, 100],
        () => {
          if (++w.writes === 3) throw new Error('boom')
        },
        { duration: 1000 },
      )
      w.anim.finished.catch((e: Error) => (w.reason = e.message))
    })
    await clock.advance(200)
    const seen = await page.evaluate(() => {
      const w = window as any
      const { errors, writes, reason } = w
      return { errors, writes, reason, state: w.anim.playState }
    })
    expect(seen).toEqual({
      errors: ['boom'],
      writes: 3,
      reason: 'boom',
      state: 'idle',
    })
  })

  test('play() when finished starts over from 0', async () => {
    const { page, clock } = await clockedPage(browser, code, '')
    await start(page)
    await clock.advance(150)
    await page.evaluate(() => (window as any).anim.play())
    expect(await read(page)).toEqual({ state: 'running', value: 0, time: 0 })
  })

  test('currentTime set when finished runs on from there', async () => {
    const { page, clock } = await clockedPage(browser, code, '')
    await start(page)
    await clock.advance(150)
    await page.evaluate(() => ((window as any).anim.currentTime = 50))
    expect(await read(page)).toEqual({ state: 'running', value: 50, time: 50 })
    await clock.advance(80)
    expect(await read(page)).toMatchObject({ state: 'finished', value: 100 })
  })

  test('reverse() when paused plays backwards, as WAAPI does', async () => {
    const { page, clock } = await clockedPage(browser, code, '')
    await start(page)
    await clock.advance(50)
    await page.evaluate(() => {
      const anim = (window as any).anim
      anim.pause()
      anim.reverse()
    })
    expect((await read(page)).state).toBe('running')
    await clock.advance(100)
    expect(await read(page)).toMatchObject({ state: 'finished', value: 0 })
  })

  test('reverse() of an endless one from idle throws InvalidStateError and changes nothing', async () => {
    const { page } = await clockedPage(browser, code, '')
    await start(page, { iterations: Infinity })
    const result = await page.evaluate(() => {
      const w = window as any
      w.anim.cancel()
      w.value = 'untouched'
      try {
        w.anim.reverse()
      } catch (error) {
        return { name: (error as DOMException).name, rate: w.anim.playbackRate }
      }
    })
    expect(result).toEqual({ name: 'InvalidStateError', rate: 1 })
    expect(await read(page)).toMatchObject({
      state: 'idle',
      value: 'untouched',
    })
  })

  test('once finished, aborting its signal changes nothing: the listener is gone', async () => {
    const { page, clock } = await clockedPage(browser, code, '')
    await page.evaluate(() => ((window as any).stop = new AbortController()))
    await page.evaluate(() => {
      const w = window as any
      w.anim = w.theater.animate([0, 100], (v: number) => (w.value = v), {
        duration: 100,
        signal: w.stop.signal,
      })
    })
    await clock.advance(150)
    await page.evaluate(() => (window as any).stop.abort())
    expect((await read(page)).state).toBe('finished')
    expect(await finishedState(page)).toBe('resolved')
  })

  test('a paused one still stops when its signal aborts', async () => {
    const { page, clock } = await clockedPage(browser, code, '')
    await page.evaluate(() => ((window as any).stop = new AbortController()))
    await page.evaluate(() => {
      const w = window as any
      w.anim = w.theater.animate([0, 100], (v: number) => (w.value = v), {
        duration: 100,
        signal: w.stop.signal,
      })
      w.anim.pause()
    })
    await clock.advance(20)
    await page.evaluate(() => (window as any).stop.abort())
    expect((await read(page)).state).toBe('idle')
  })

  test.each([
    { iterations: 1.5, direction: 'alternate' },
    { iterations: 1.5, direction: 'normal' },
    { iterations: 2, direction: 'alternate' },
    { iterations: 0, direction: 'normal' },
  ])(
    '%o lands where an element animation does (WAAPI current iteration)',
    async (timing) => {
      const { page } = await clockedPage(browser, code, '<p id="p">p</p>')
      await start(page, timing)
      const pairs = await page.evaluate((timing) => {
        const w = window as any
        const options = { ...timing, duration: 100, fill: 'both' }
        const el = document
          .getElementById('p')!
          .animate({ opacity: [0, 1] }, options as KeyframeAnimationOptions)
        return [0, 40, 99, 100, 120, 149, 150, 199, 200, 250].map((t) => {
          w.anim.pause()
          w.anim.currentTime = el.currentTime = t
          const progress = el.effect!.getComputedTiming().progress!
          const round = (n: number) => Math.round(n * 1e4) / 1e4
          return [t, round(w.value), round(progress * 100)]
        })
      }, timing)
      for (const [t, value, element] of pairs)
        expect([t, value]).toEqual([t, element])
    },
  )

  test('iterations: 1.5, alternate: its velocity runs backwards in the second iteration', async () => {
    const { page } = await clockedPage(browser, code, '')
    await start(page, { iterations: 1.5, direction: 'alternate' })
    const velocity = await page.evaluate(() => {
      const anim = (window as any).anim
      anim.currentTime = 120
      return anim.velocity
    })
    expect(velocity).toBeCloseTo(-1000, 3) // 100 units per 100 ms, backwards
  })

  test('a NaN or negative duration, delay or iterations throws a TypeError, as WAAPI does', async () => {
    const { page } = await clockedPage(browser, code, '')
    const errors = await page.evaluate(() =>
      [
        { duration: NaN },
        { duration: -1 },
        { delay: NaN },
        { iterations: NaN },
        { iterations: -1 },
      ].map((options) => {
        try {
          ;(window as any).theater.animate([0, 1], () => {}, options)
        } catch (error) {
          return (error as Error).name
        }
      }),
    )
    expect(errors).toEqual(Array(5).fill('TypeError'))
  })
})
