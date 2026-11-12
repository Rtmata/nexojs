/** scroll, inView and parallax in Chrome: the browser's timelines, and the fallback without them. */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { chromium, type Browser, type Page } from 'playwright'
import { bundle, chrome, pageWith } from './page.fixture'

let browser: Browser
let code: string

/** A 720 px viewport, a 200 px subject 1500 px down, 4000 px of page. */
const PAGE =
  '<style>body { margin: 0 } #s { margin-top: 1500px; height: 200px } #rest { height: 2300px }</style><div id="s">s</div><div id="rest"></div>'

/** A 400 px `overflow: hidden` box: the 200 px subject 1000 px down its content. */
const BOX =
  '<style>body { margin: 0 } #box { overflow: hidden; height: 400px } #s { margin-top: 1000px; height: 200px } #rest { height: 1000px }</style><div id="box"><div id="s">s</div><div id="rest"></div></div>'

/** Before `setContent`, which keeps the window: an init script would never run (no navigation). */
const withoutTimelines = async (page: Page) => {
  await page.evaluate(() => {
    delete (window as any).ScrollTimeline
    delete (window as any).ViewTimeline
  })
}

async function scrolledTo(page: Page, y: number): Promise<void> {
  await page.evaluate(async (y) => {
    window.scrollTo(0, y)
    for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame)
  }, y)
}

const opacity = (page: Page) =>
  page.evaluate(() =>
    Number(getComputedStyle(document.getElementById('s')!).opacity),
  )

describe.skipIf(!chrome)('scroll in Chrome', () => {
  beforeAll(async () => {
    browser = await chromium.launch({ channel: 'chrome' })
    code = await bundle()
  })

  afterAll(async () => {
    await browser?.close()
  })

  for (const [name, before] of [
    ['the browser timeline', undefined],
    ['the fallback', withoutTimelines],
  ] as const) {
    test(`a view: the subject crossing the viewport drives it (${name})`, async () => {
      const page = await pageWith(browser, code, PAGE, before)
      await page.evaluate(() => {
        const { animate, scroll } = (window as any).theater
        const s = document.getElementById('s')!
        scroll(animate(s, { opacity: [0, 1] }, { easing: 'linear' }), {
          subject: s,
          signal: new AbortController().signal,
        })
      })
      // cover runs from 1500 − 720 = 780 to 1700: 920 px
      await scrolledTo(page, 780 + 460)
      expect(await opacity(page)).toBeCloseTo(0.5, 1)
      await scrolledTo(page, 3000)
      expect(await opacity(page)).toBe(1)
      await scrolledTo(page, 780 + 230) // back: it is still linked
      expect(await opacity(page)).toBeCloseTo(0.25, 1)
    })

    test(`a range: entry runs while the subject comes in (${name})`, async () => {
      const page = await pageWith(browser, code, PAGE, before)
      await page.evaluate(() => {
        const { animate, scroll } = (window as any).theater
        const s = document.getElementById('s')!
        scroll(animate(s, { opacity: [0, 1] }, { easing: 'linear' }), {
          subject: s,
          rangeStart: 'entry 0%',
          rangeEnd: 'entry 100%',
          signal: new AbortController().signal,
        })
      })
      await scrolledTo(page, 780 + 100) // entry: 780 → 980
      expect(await opacity(page)).toBeCloseTo(0.5, 1)
    })

    test(`an already-aborted signal leaves nothing linked (${name})`, async () => {
      const page = await pageWith(browser, code, PAGE, before)
      await page.evaluate(() => {
        const { animate, scroll } = (window as any).theater
        const s = document.getElementById('s')!
        scroll(animate(s, { opacity: [0, 1] }, { easing: 'linear' }), {
          subject: s,
          signal: AbortSignal.abort(),
        })
      })
      await scrolledTo(page, 1200)
      expect(await page.evaluate(() => document.getAnimations().length)).toBe(0)
    })

    test(`body's overflow-x: hidden is the page's: the view still follows it (${name})`, async () => {
      const html = `<style>body { overflow-x: hidden }</style>${PAGE}`
      const page = await pageWith(browser, code, html, before)
      await page.evaluate(() => {
        const { animate, scroll } = (window as any).theater
        const s = document.getElementById('s')!
        scroll(animate(s, { opacity: [0, 1] }, { easing: 'linear' }), {
          subject: s,
          signal: new AbortController().signal,
        })
      })
      await scrolledTo(page, 780 + 460)
      expect(await opacity(page)).toBeCloseTo(0.5, 1)
    })

    test(`an overflow: hidden box is the view's scroller (${name})`, async () => {
      const page = await pageWith(browser, code, BOX, before)
      await page.evaluate(async () => {
        const { animate, scroll } = (window as any).theater
        const s = document.getElementById('s')!
        scroll(animate(s, { opacity: [0, 1] }, { easing: 'linear' }), {
          subject: s,
          signal: new AbortController().signal,
        })
        document.getElementById('box')!.scrollTop = 900 // cover: 600 → 1200
        for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame)
      })
      expect(await opacity(page)).toBeCloseTo(0.5, 1)
    })
  }

  test('a value and a function follow the page scroll', async () => {
    const page = await pageWith(browser, code, PAGE)
    await page.evaluate(() => {
      const w = window as any
      const { animate, scroll } = w.theater
      const signal = new AbortController().signal
      scroll(
        animate([0, 100], (v: number) => (w.value = v), { easing: 'linear' }),
        { signal },
      )
      scroll((p: number) => (w.progress = p), { signal })
    })
    await scrolledTo(page, (4000 - 720) / 2)
    const [value, progress] = await page.evaluate(() => [
      (window as any).value,
      (window as any).progress,
    ])
    expect(progress).toBeCloseTo(0.5, 2)
    expect(value).toBeCloseTo(50, 0)
  })

  test('aborting unlinks it; the element keeps what it shows', async () => {
    const page = await pageWith(browser, code, PAGE)
    await page.evaluate(() => {
      const w = window as any
      const s = document.getElementById('s')!
      w.stop = new AbortController()
      w.theater.scroll(
        w.theater.animate(s, { opacity: [0, 1] }, { easing: 'linear' }),
        { subject: s, signal: w.stop.signal },
      )
    })
    await scrolledTo(page, 780 + 460)
    await page.evaluate(() => (window as any).stop.abort())
    await scrolledTo(page, 3000)
    expect(await opacity(page)).toBeCloseTo(0.5, 1)
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0)
  })

  test('aborting before a queued frame runs keeps it let go (the fallback)', async () => {
    const page = await pageWith(browser, code, PAGE, withoutTimelines)
    const result = await page.evaluate(async () => {
      const w = window as any
      const { animate, scroll } = w.theater
      const s = document.getElementById('s')!
      const stop = new AbortController()
      scroll(animate(s, { opacity: [0, 1] }, { easing: 'linear' }), {
        subject: s,
        signal: stop.signal,
      })
      scroll((p: number) => (w.progress = p), { signal: stop.signal })
      stop.abort() // the first frame's read and write are already asked for
      for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame)
      return [document.getAnimations().length, w.progress]
    })
    expect(result).toEqual([0, undefined])
  })

  test('inView: each visit has a signal that aborts when it leaves', async () => {
    const page = await pageWith(browser, code, PAGE)
    await page.evaluate(() => {
      const w = window as any
      w.visits = 0
      w.left = 0
      w.theater.inView(
        document.getElementById('s'),
        (_: unknown, { signal }: { signal: AbortSignal }) => {
          w.visits++
          signal.addEventListener('abort', () => w.left++)
        },
        { signal: new AbortController().signal },
      )
    })
    await scrolledTo(page, 1200)
    await scrolledTo(page, 0)
    await scrolledTo(page, 1200)
    const result = await page.evaluate(() => [
      (window as any).visits,
      (window as any).left,
    ])
    expect(result).toEqual([2, 1])
  })

  test('inView: an already-aborted signal watches nothing', async () => {
    const page = await pageWith(browser, code, PAGE)
    await page.evaluate(() => {
      const w = window as any
      w.visits = 0
      w.theater.inView(document.getElementById('s'), () => w.visits++, {
        signal: AbortSignal.abort(),
      })
    })
    await scrolledTo(page, 1200)
    expect(await page.evaluate(() => (window as any).visits)).toBe(0)
  })

  test('inView: a throwing enter is reported; the batch and once go on', async () => {
    const page = await pageWith(
      browser,
      code,
      '<p id="a">a</p><p id="b">b</p><div style="height: 3000px"></div>',
    )
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.evaluate(() => {
      const w = window as any
      w.entered = []
      const a = document.getElementById('a')!
      const b = document.getElementById('b')!
      w.theater.inView(
        [a, b],
        (entry: IntersectionObserverEntry) => {
          w.entered.push(entry.target.id)
          if (entry.target === a) throw new Error('enter broke')
        },
        { once: true, signal: new AbortController().signal },
      )
    })
    await scrolledTo(page, 0)
    await scrolledTo(page, 2000)
    await scrolledTo(page, 0)
    expect(await page.evaluate(() => (window as any).entered)).toEqual([
      'a',
      'b',
    ])
    expect(errors).toEqual(['enter broke'])
  })

  test('inView once: only the first visit runs, and its signal aborts when the element leaves', async () => {
    const page = await pageWith(browser, code, PAGE)
    await page.evaluate(() => {
      const w = window as any
      w.visits = 0
      w.left = 0
      w.theater.inView(
        document.getElementById('s'),
        (_: unknown, { signal }: { signal: AbortSignal }) => {
          w.visits++
          signal.addEventListener('abort', () => w.left++)
        },
        { once: true, signal: new AbortController().signal },
      )
    })
    await scrolledTo(page, 1200)
    await scrolledTo(page, 0)
    await scrolledTo(page, 1200)
    await scrolledTo(page, 0)
    const result = await page.evaluate(() => [
      (window as any).visits,
      (window as any).left,
    ])
    expect(result).toEqual([1, 1])
  })

  test('parallax: the layer lags as it crosses; under reduced motion it stays put', async () => {
    const page = await pageWith(browser, code, PAGE)
    await page.evaluate(() =>
      (window as any).theater.parallax(document.getElementById('s'), {
        signal: new AbortController().signal,
        depth: 0.2,
      }),
    )
    await scrolledTo(page, 780) // cover 0%: 10vh up
    const start = await page.evaluate(
      () => getComputedStyle(document.getElementById('s')!).translate,
    )
    expect(start).toBe('0px -72px')
    const calm = await pageWith(browser, code, PAGE, (p) =>
      p.emulateMedia({ reducedMotion: 'reduce' }),
    )
    await calm.evaluate(() =>
      (window as any).theater.parallax(document.getElementById('s'), {
        signal: new AbortController().signal,
        depth: 0.2,
      }),
    )
    expect(await calm.evaluate(() => document.getAnimations().length)).toBe(0)
  })
})
