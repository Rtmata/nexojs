/**
 * The browser harness theater's browser tests share: Chrome through
 * Playwright, and a page with the pieces as `window.theater`.
 */
import type { Browser, Page } from 'playwright'
import { testClock, type TestClock } from '../../shared/theater/test-clock'

export const chrome = Boolean(
  Bun.which('google-chrome') || Bun.which('google-chrome-stable'),
)

/** The pieces in `theater.fixture.ts`, bundled once per test file. */
export async function bundle(): Promise<string> {
  const entry = new URL('./theater.fixture.ts', import.meta.url).pathname
  const built = await Bun.build({ entrypoints: [entry], format: 'esm' })
  return built.outputs[0]!.text()
}

/** A fresh page with `window.theater` and `html` in its body. */
export async function pageWith(
  browser: Browser,
  code: string,
  html: string,
  before?: (page: Page) => Promise<void>,
): Promise<Page> {
  const page = await browser.newPage()
  await before?.(page)
  await page.setContent(`<!doctype html><title>theater</title><body>${html}`)
  await page.evaluate(async (code) => {
    const blob = new Blob([code], { type: 'text/javascript' })
    ;(window as any).theater = await import(URL.createObjectURL(blob))
  }, code)
  return page
}

/** A page whose time only moves when the test says. */
export async function clockedPage(
  browser: Browser,
  code: string,
  html: string,
): Promise<{ page: Page; clock: TestClock }> {
  let clock!: TestClock
  const page = await pageWith(browser, code, html, async (p) => {
    clock = await testClock(p)
  })
  return { page, clock }
}
