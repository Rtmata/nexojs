/**
 * connector in a real browser, for what only a browser has: animation frames,
 * idle time and media queries. The module is bundled once and imported into a
 * blank page; everything else is tested without a DOM, next to its file.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { chromium, type Browser, type Page } from 'playwright'

const chrome = Boolean(
  Bun.which('google-chrome') || Bun.which('google-chrome-stable'),
)
if (!chrome) console.warn('connector: browser tests skipped, no Chrome found')

let browser: Browser
let page: Page

async function bundle(): Promise<string> {
  const entry = new URL('./index.ts', import.meta.url).pathname
  const built = await Bun.build({ entrypoints: [entry], format: 'esm' })
  return built.outputs[0]!.text()
}

/** The page gets `window.connector`, imported from the bundle. */
async function loadInto(page: Page, code: string): Promise<void> {
  await page.setContent('<!doctype html><title>connector</title>')
  await page.evaluate(async (code) => {
    const blob = new Blob([code], { type: 'text/javascript' })
    ;(window as any).connector = await import(URL.createObjectURL(blob))
  }, code)
}

describe.skipIf(!chrome)('connector in Chrome', () => {
  beforeAll(async () => {
    browser = await chromium.launch({ channel: 'chrome' })
    page = await browser.newPage()
    await loadInto(page, await bundle())
  })

  afterAll(async () => {
    await browser?.close()
  })

  test('microtask, the default, runs an effect after the current code', async () => {
    const result = await page.evaluate(async () => {
      const { effect, signal } = (window as any).connector
      const n = signal(1)
      const runs: number[] = []
      effect(() => runs.push(n.get()))
      const before = runs.length
      await Promise.resolve()
      n.set(2)
      await Promise.resolve()
      return { before, runs }
    })
    expect(result).toEqual({ before: 0, runs: [1, 2] })
  })

  test('frame runs an effect on the next animation frame', async () => {
    const result = await page.evaluate(async () => {
      const { effect, frame, signal } = (window as any).connector
      const n = signal(0)
      const runs: number[] = []
      effect(() => runs.push(n.get()), { scheduler: frame })
      const before = runs.length
      await new Promise(requestAnimationFrame)
      await new Promise(requestAnimationFrame)
      return { before, after: runs.length }
    })
    expect(result).toEqual({ before: 0, after: 1 })
  })

  test('a frame effect that writes itself is an animation, not a loop', async () => {
    const result = await page.evaluate(async () => {
      const { effect, frame, signal } = (window as any).connector
      const step = signal(0)
      const errors: unknown[] = []
      const stop = effect(() => step.get() < 5 && step.set(step.peek() + 1), {
        scheduler: frame,
        onError: (e: unknown) => errors.push(e),
      })
      for (let i = 0; i < 10; i++) await new Promise(requestAnimationFrame)
      stop()
      return { step: step.peek(), errors: errors.length }
    })
    expect(result).toEqual({ step: 5, errors: 0 })
  })

  test('idle is the real thing in Chrome, and runs the effect', async () => {
    const result = await page.evaluate(async () => {
      const { effect, idle, signal } = (window as any).connector
      const n = signal(1)
      let seen = 0
      effect(() => (seen = n.get()), { scheduler: idle })
      await new Promise((done) => requestIdleCallback(done))
      await new Promise((done) => setTimeout(done, 50))
      return { native: idle.native, seen }
    })
    expect(result).toEqual({ native: true, seen: 1 })
  })

  test('MediaQuery follows the query', async () => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.evaluate(() => {
      const { MediaQuery } = (window as any).connector
      ;(window as any).dark = new MediaQuery('(prefers-color-scheme: dark)')
    })
    expect(await page.evaluate(() => (window as any).dark.get())).toBe(false)
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.waitForFunction(() => (window as any).dark.get() === true)
    expect(await page.evaluate(() => (window as any).dark.matches)).toBe(true)
  })

  test('MediaQuery stops listening when its signal aborts', async () => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.evaluate(() => {
      const { MediaQuery } = (window as any).connector
      const controller = new AbortController()
      ;(window as any).stopped = new MediaQuery(
        '(prefers-color-scheme: dark)',
        {
          signal: controller.signal,
        },
      )
      controller.abort()
    })
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.evaluate(() => new Promise((done) => setTimeout(done, 50)))
    expect(await page.evaluate(() => (window as any).stopped.get())).toBe(false)
  })
})
