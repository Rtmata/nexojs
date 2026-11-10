/** The test clock in Chrome: what the page does to its animations between advances. */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { chromium, type Browser, type Page } from 'playwright'
import { bundle, chrome, clockedPage } from '../../client/theater/page.fixture'

let browser: Browser
let code: string

/** The current time of `#a`'s first animation. */
const timeOfA = (page: Page) =>
  page.evaluate(
    () => document.getElementById('a')!.getAnimations()[0]!.currentTime,
  )

/**
 * `ms` of real time in which the page renders frames, as it does while
 * the measured flash checker takes screenshots: only then does the
 * document's real timeline move a playing animation. (Chrome sometimes
 * refuses a page's first capture; a frame is all this needs.)
 */
async function framesFor(page: Page, ms: number): Promise<void> {
  await page.screenshot().catch(() => undefined)
  await new Promise((resolve) => setTimeout(resolve, ms))
  await page.screenshot().catch(() => undefined)
}

describe.skipIf(!chrome)('testClock in Chrome', () => {
  beforeAll(async () => {
    browser = await chromium.launch({ channel: 'chrome' })
    code = await bundle()
  })

  afterAll(async () => {
    await browser?.close()
  })

  test('after the page plays an animation, the real time until the next advance does not count', async () => {
    const { page, clock } = await clockedPage(browser, code, '<p id="a">a</p>')
    await page.evaluate(() => {
      document.getElementById('a')!.animate({ opacity: [0, 1] }, 1000)
    })
    await clock.advance(160)
    await page.evaluate(() => {
      const a = document.getElementById('a')!.getAnimations()[0]!
      a.pause()
      a.play()
    })
    await framesFor(page, 200)
    await clock.advance(16)
    expect(await timeOfA(page)).toBeCloseTo(176, 0)
  })

  test('a CSS animation paused by animation-play-state stays put until CSS lets it go', async () => {
    const css =
      '<style>@keyframes rise { to { translate: 0 40px } } #a { animation: rise 400ms linear; animation-play-state: paused }</style>'
    const { page, clock } = await clockedPage(
      browser,
      code,
      `${css}<p id="a">a</p>`,
    )
    await clock.advance(160)
    expect(await timeOfA(page)).toBe(0)
    const playState = (state: string) =>
      page.evaluate((state) => {
        document.getElementById('a')!.style.animationPlayState = state
      }, state)
    await playState('running')
    await clock.advance(96)
    expect(await timeOfA(page)).toBeCloseTo(96, 0)
    await playState('paused')
    await clock.advance(96)
    expect(await timeOfA(page)).toBeCloseTo(96, 0)
  })

  test('a finish or a seek before the first advance is where the clock goes on from', async () => {
    const { page, clock } = await clockedPage(
      browser,
      code,
      '<p id="a">a</p><p id="b">b</p>',
    )
    await page.evaluate(() => {
      document
        .getElementById('a')!
        .animate({ opacity: [0, 1] }, { duration: 300, fill: 'forwards' })
        .finish()
      const b = document.getElementById('b')!.animate({ opacity: [0, 1] }, 1000)
      b.currentTime = 100
    })
    await new Promise((resolve) => setTimeout(resolve, 50))
    await clock.advance(16)
    const [a, b] = await page.evaluate(() =>
      ['a', 'b'].map((id) => {
        const animation = document.getElementById(id)!.getAnimations()[0]
        return [animation?.playState, animation?.currentTime]
      }),
    )
    expect(a).toEqual(['finished', 300])
    expect(b![1]).toBeCloseTo(116, 0)
  })

  test('an animation at playback rate 0 stands still, and the others still move', async () => {
    const { page, clock } = await clockedPage(
      browser,
      code,
      '<p id="a">a</p><p id="b">b</p>',
    )
    await page.evaluate(() => {
      const still = document
        .getElementById('b')!
        .animate({ opacity: [0, 1] }, 1000)
      still.playbackRate = 0
      document.getElementById('a')!.animate({ opacity: [0, 1] }, 1000)
    })
    await clock.advance(32)
    expect(await timeOfA(page)).toBeCloseTo(32, 0)
  })
})
