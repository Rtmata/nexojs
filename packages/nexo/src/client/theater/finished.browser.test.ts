/** `finished` (C.2) in Chrome, on the test clock. */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { chromium, type Browser, type Page } from 'playwright'
import { bundle, chrome, clockedPage } from './page.fixture'

let browser: Browser
let code: string

const PAGE =
  '<style>@keyframes turn { to { opacity: 0.5 } } @keyframes glow { to { color: red } } #p { animation: turn 300ms, glow 2000ms }</style><p id="p">p</p>'

/** How many listeners the page's `window.<name>` has, read through DevTools. */
async function listenersOf(page: Page, name: string): Promise<number> {
  const cdp = await page.context().newCDPSession(page)
  const { result } = await cdp.send('Runtime.evaluate', { expression: name })
  const { listeners } = await cdp.send('DOMDebugger.getEventListeners', {
    objectId: result.objectId!,
  })
  return listeners.length
}

describe.skipIf(!chrome)('finished in Chrome', () => {
  beforeAll(async () => {
    browser = await chromium.launch({ channel: 'chrome' })
    code = await bundle()
  })

  afterAll(async () => {
    await browser?.close()
  })

  test('waits for the named CSS animation only', async () => {
    const { page, clock } = await clockedPage(browser, code, PAGE)
    await page.evaluate(() => {
      const w = window as any
      w.theater
        .finished(document.getElementById('p'), { name: 'turn' })
        .then(() => (w.turned = true))
    })
    await clock.advance(320)
    expect(await page.evaluate(() => (window as any).turned)).toBe(true)
  })

  test('with nothing to wait for it resolves at once', async () => {
    const { page } = await clockedPage(browser, code, '<p id="q">q</p>')
    const result = await page.evaluate(async () => {
      await (window as any).theater.finished(document.getElementById('q'))
      return 'done'
    })
    expect(result).toBe('done')
  })

  test('an endless animation is not waited for, unless it is the one named', async () => {
    const SPINNER =
      '<style>@keyframes spin { to { rotate: 1turn } } #s { animation: spin 1s infinite }</style><p id="s">s</p>'
    const { page, clock } = await clockedPage(browser, code, SPINNER)
    await page.evaluate(() => {
      const w = window as any
      const s = document.getElementById('s')
      w.theater.finished(s).then(() => (w.all = true))
      w.theater.finished(s, { name: 'spin' }).then(() => (w.named = true))
    })
    await clock.advance(16)
    expect(await page.evaluate(() => (window as any).all)).toBe(true)
    expect(await page.evaluate(() => (window as any).named)).toBeUndefined()
    await clock.advance(4000)
    expect(await page.evaluate(() => (window as any).named)).toBe(true)
  })

  test('the signal stops the wait', async () => {
    const { page } = await clockedPage(browser, code, PAGE)
    const result = await page.evaluate(async () => {
      const stop = new AbortController()
      const wait = (window as any).theater.finished(
        document.getElementById('p'),
        { signal: stop.signal },
      )
      stop.abort()
      await wait
      return 'stopped'
    })
    expect(result).toBe('stopped')
  })
  test('a wait that ends lets go of its signal', async () => {
    const { page, clock } = await clockedPage(browser, code, PAGE)
    await page.evaluate(() => {
      const w = window as any
      w.sig = new AbortController().signal
      w.theater
        .finished(document.getElementById('p'), { name: 'turn', signal: w.sig })
        .then(() => (w.turned = true))
    })
    await clock.advance(320)
    expect(await page.evaluate(() => (window as any).turned)).toBe(true)
    expect(await listenersOf(page, 'sig')).toBe(0)
  })
})
