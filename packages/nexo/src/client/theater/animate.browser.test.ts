/** `animate` in Chrome, on the test clock: elements on WAAPI, values on the frame loop. */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { chromium, type Browser, type Page } from 'playwright'
import { bundle, chrome, clockedPage } from './page.fixture'

let browser: Browser
let code: string

const style = (page: Page, id: string, property: string) =>
  page.evaluate(
    ([id, property]) =>
      getComputedStyle(document.getElementById(id!)!).getPropertyValue(
        property!,
      ),
    [id, property],
  )

const inline = (page: Page, id: string) =>
  page.evaluate((id) => document.getElementById(id)!.getAttribute('style'), id)

describe.skipIf(!chrome)('animate in Chrome', () => {
  beforeAll(async () => {
    browser = await chromium.launch({ channel: 'chrome' })
    code = await bundle()
  })

  afterAll(async () => {
    await browser?.close()
  })

  test('an element runs on WAAPI and ends with what is seen, written inline', async () => {
    const { page, clock } = await clockedPage(browser, code, '<p id="a">a</p>')
    await page.evaluate(() => {
      ;(window as any).theater.animate(
        document.getElementById('a'),
        { opacity: [0, 1] },
        { duration: 400, easing: 'linear' },
      )
    })
    await clock.advance(200)
    expect(Number(await style(page, 'a', 'opacity'))).toBeCloseTo(0.5, 1)
    await clock.advance(220)
    expect(await inline(page, 'a')).toBe('opacity: 1;')
    expect(
      await page.evaluate(
        () => document.getElementById('a')!.getAnimations().length,
      ),
    ).toBe(0)
  })

  test('aborting stops it where it is; cancel() goes back to the start', async () => {
    const { page, clock } = await clockedPage(
      browser,
      code,
      '<p id="a">a</p><p id="b">b</p>',
    )
    await page.evaluate(() => {
      const { animate } = (window as any).theater
      const w = window as any
      w.stop = new AbortController()
      animate(
        document.getElementById('a'),
        { opacity: [0, 1] },
        { duration: 400, easing: 'linear', signal: w.stop.signal },
      )
      w.b = animate(
        document.getElementById('b'),
        { opacity: [0, 1] },
        { duration: 400, easing: 'linear' },
      )
    })
    await clock.advance(200)
    await page.evaluate(() => {
      ;(window as any).stop.abort()
      ;(window as any).b.cancel()
    })
    expect(Number(await style(page, 'a', 'opacity'))).toBeCloseTo(0.5, 1)
    expect(await inline(page, 'b')).toBeNull()
    expect(await style(page, 'b', 'opacity')).toBe('1')
  })

  test('reduced motion: what moves jumps to its end, opacity still fades', async () => {
    const { page, clock } = await clockedPage(browser, code, '<p id="a">a</p>')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.evaluate(() => {
      ;(window as any).theater.animate(
        document.getElementById('a'),
        { opacity: [0, 1], translate: ['0 24px', '0 0'] },
        { duration: 400, easing: 'linear' },
      )
    })
    await clock.advance(200)
    expect(await style(page, 'a', 'translate')).toBe('0px')
    expect(Number(await style(page, 'a', 'opacity'))).toBeCloseTo(0.5, 1)
  })

  test("reduce: 'jump' ends everything at once; reduce: false runs it all", async () => {
    const { page, clock } = await clockedPage(
      browser,
      code,
      '<p id="a">a</p><p id="b">b</p>',
    )
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.evaluate(() => {
      const { animate } = (window as any).theater
      animate(
        document.getElementById('a'),
        { opacity: [0, 1] },
        { duration: 400, reduce: 'jump' },
      )
      animate(
        document.getElementById('b'),
        { translate: ['0 40px', '0 0'] },
        { duration: 400, easing: 'linear', reduce: false },
      )
    })
    await clock.advance(32)
    expect(await style(page, 'a', 'opacity')).toBe('1')
    expect(await style(page, 'b', 'translate')).not.toBe('0px')
  })

  test('speed below the element stretches its time', async () => {
    const { page, clock } = await clockedPage(
      browser,
      code,
      '<main style="--theater-speed: 0.5"><p id="a">a</p></main>',
    )
    await page.evaluate(() => {
      ;(window as any).theater.animate(
        document.getElementById('a'),
        { opacity: [0, 1] },
        { duration: 400, easing: 'linear' },
      )
    })
    await clock.advance(400)
    expect(Number(await style(page, 'a', 'opacity'))).toBeCloseTo(0.5, 1)
  })

  test('a spring becomes linear() with its computed duration', async () => {
    const { page } = await clockedPage(browser, code, '<p id="a">a</p>')
    const timing = await page.evaluate(() => {
      const a = (window as any).theater.animate(
        document.getElementById('a'),
        { opacity: [0, 1] },
        { spring: { duration: 400, bounce: 0.3 } },
      )
      const t = a.effect.getTiming()
      return { easing: t.easing as string, duration: t.duration as number }
    })
    expect(timing.easing.startsWith('linear(')).toBe(true)
    expect(timing.duration).toBeGreaterThan(400)
  })

  test('a list of elements answers as one Animation', async () => {
    const { page, clock } = await clockedPage(
      browser,
      code,
      '<p class="c">1</p><p class="c">2</p>',
    )
    await page.evaluate(() => {
      const w = window as any
      w.group = w.theater.animate(
        document.querySelectorAll('.c'),
        { opacity: [0, 1] },
        { duration: 400, easing: 'linear' },
      )
    })
    await clock.advance(100)
    await page.evaluate(() => (window as any).group.pause())
    await clock.advance(200)
    const result = await page.evaluate(() => ({
      state: (window as any).group.playState,
      opacities: [...document.querySelectorAll('.c')].map((el) =>
        Number(getComputedStyle(el).opacity),
      ),
    }))
    expect(result.state).toBe('paused')
    for (const opacity of result.opacities) expect(opacity).toBeCloseTo(0.25, 1)
  })

  test('a value runs on the frame loop and finished resolves at its end', async () => {
    const { page, clock } = await clockedPage(browser, code, '')
    await page.evaluate(() => {
      const w = window as any
      w.seen = []
      w.anim = w.theater.animate([0, 100], (v: number) => w.seen.push(v), {
        duration: 160,
        easing: 'linear',
      })
      w.anim.finished.then(() => (w.done = true))
    })
    await clock.advance(80)
    const mid = await page.evaluate(() => (window as any).seen.at(-1))
    await clock.advance(120)
    const end = await page.evaluate(() => [
      (window as any).seen.at(-1),
      (window as any).done,
    ])
    expect(mid).toBeGreaterThan(30)
    expect(mid).toBeLessThan(70)
    expect(end).toEqual([100, true])
  })

  test('a value: abort stays, cancel writes the start, finished rejects with AbortError', async () => {
    const { page, clock } = await clockedPage(browser, code, '')
    await page.evaluate(() => {
      const w = window as any
      w.a = { value: -1 }
      w.b = { value: -1 }
      w.stop = new AbortController()
      w.anim = w.theater.animate(
        [0, 100],
        { set: (v: number) => (w.a.value = v) },
        { duration: 160, easing: 'linear', signal: w.stop.signal },
      )
      w.anim.finished.catch((e: DOMException) => (w.reason = e.name))
      w.other = w.theater.animate([0, 100], (v: number) => (w.b.value = v), {
        duration: 160,
        easing: 'linear',
      })
    })
    await clock.advance(80)
    await page.evaluate(() => {
      ;(window as any).stop.abort()
      ;(window as any).other.cancel()
    })
    await clock.advance(16)
    const result = await page.evaluate(() => [
      (window as any).a.value,
      (window as any).b.value,
      (window as any).reason,
    ])
    expect(result[0]).toBeGreaterThan(30)
    expect(result[1]).toBe(0)
    expect(result[2]).toBe('AbortError')
  })

  test('a value: two alternate iterations come back to the start', async () => {
    const { page, clock } = await clockedPage(browser, code, '')
    await page.evaluate(() => {
      const w = window as any
      w.last = -1
      w.theater.animate([0, 100], (v: number) => (w.last = v), {
        duration: 100,
        easing: 'linear',
        iterations: 2,
        direction: 'alternate',
      })
    })
    await clock.advance(240)
    expect(await page.evaluate(() => (window as any).last)).toBe(0)
  })

  test('a selector string is refused with what to use instead', async () => {
    const { page } = await clockedPage(browser, code, '')
    const message = await page.evaluate(() => {
      try {
        ;(window as any).theater.animate('.cover', { opacity: [0, 1] })
      } catch (error) {
        return (error as Error).message
      }
    })
    expect(message).toContain('no selector strings')
  })

  test('an empty list of elements is a no-op, not a value', async () => {
    const { page } = await clockedPage(browser, code, '')
    const state = await page.evaluate(async () => {
      const group = (window as any).theater.animate([], { opacity: [0, 1] })
      await group.finished
      return group.playState
    })
    expect(state).toBe('finished')
  })
})
