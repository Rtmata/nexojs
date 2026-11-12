/** An element animation's retirement in Chrome. */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { chromium, type Browser, type Page } from 'playwright'
import { bundle, chrome, pageWith } from './page.fixture'

let browser: Browser
let code: string

/** How many listeners the page's `window.<name>` has, read through DevTools. */
async function listenersOf(page: Page, name: string): Promise<number> {
  const cdp = await page.context().newCDPSession(page)
  const { result } = await cdp.send('Runtime.evaluate', { expression: name })
  const { listeners } = await cdp.send('DOMDebugger.getEventListeners', {
    objectId: result.objectId!,
  })
  return listeners.length
}

describe.skipIf(!chrome)('element animations in Chrome', () => {
  beforeAll(async () => {
    browser = await chromium.launch({ channel: 'chrome' })
    code = await bundle()
  })

  afterAll(async () => {
    await browser?.close()
  })

  for (const [name, hide] of [
    ['display: none', 'a.style.display = "none"'],
    ['removed', 'a.remove()'],
  ] as const) {
    test(`aborting one no longer rendered (${name}) still retires it`, async () => {
      const page = await pageWith(browser, code, '<p id="a">a</p>')
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      const left = await page.evaluate((hide) => {
        const a = document.getElementById('a')!
        const stop = new AbortController()
        const animation = (window as any).theater.animate(
          a,
          { opacity: [0, 1] },
          { duration: 10_000, signal: stop.signal },
        )
        new Function('a', hide)(a)
        stop.abort()
        return animation.playState
      }, hide)
      expect(left).toBe('idle')
      expect(errors).toEqual([])
    })
  }

  test('an animation that ends lets go of its signal', async () => {
    const page = await pageWith(browser, code, '<p id="a">a</p>')
    await page.evaluate(async () => {
      const w = window as any
      w.stop = new AbortController()
      w.sig = w.stop.signal
      const animation = w.theater.animate(
        document.getElementById('a'),
        { opacity: [0, 1] },
        { duration: 10_000, signal: w.sig },
      )
      animation.finish()
      await animation.finished
      await new Promise((r) => setTimeout(r))
    })
    expect(await listenersOf(page, 'sig')).toBe(0)
  })
})
