/** The built-in panels (D.4) in real engines, with real keys (Playwright). */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import {
  chromium,
  firefox,
  webkit,
  type Browser,
  type BrowserType,
  type Page,
} from 'playwright'

const engines: [string, BrowserType][] = [
  ['chromium', chromium],
  ['webkit', webkit],
  ['firefox', firefox],
]

const entry = new URL('./library.fixture.ts', import.meta.url).pathname
const built = await Bun.build({ entrypoints: [entry], format: 'esm' })
if (!built.success) throw new AggregateError(built.logs, 'bundle failed')
const code = await built.outputs[0]!.text()

const toolbar = (attrs: string, extra = '') => `
  <button id="before">before</button>
  <div data-panel="focusgroup" focusgroup="${attrs}">
    <button id="a">a</button><button id="b">b</button>${extra}<button id="c">c</button>
  </div>
  <button id="after">after</button>`

for (const [name, engine] of engines) {
  describe(`focusgroup in ${name}`, () => {
    let browser: Browser
    let page: Page
    const setup = (html: string) =>
      page.evaluate((h) => (window as any).library.setup(h), html)
    const active = () => page.evaluate(() => document.activeElement?.id ?? null)
    const keys = async (...list: string[]) => {
      for (const key of list) await page.keyboard.press(key)
      return active()
    }
    const enter = async () => {
      await page.focus('#before')
      await page.keyboard.press('Tab')
      return active()
    }

    beforeAll(async () => {
      browser = await engine.launch()
      page = await browser.newPage()
      await page.setContent(
        '<!doctype html><title>library</title><body></body>',
      )
      await page.evaluate(async (code) => {
        const url = URL.createObjectURL(
          new Blob([code], { type: 'text/javascript' }),
        )
        ;(window as any).library = await import(url)
      }, code)
    })
    afterAll(async () => {
      await browser?.close()
    })

    test('one tab stop; arrows on its axis move, the other axis does nothing', async () => {
      await setup(toolbar('toolbar inline'))
      expect(await enter()).toBe('a')
      expect(await keys('ArrowRight')).toBe('b')
      expect(await keys('ArrowDown')).toBe('b')
      expect(await keys('Tab')).toBe('after')
    })

    test('wrap, nowrap, Home and End', async () => {
      await setup(toolbar('toolbar inline wrap'))
      await enter()
      expect(await keys('ArrowLeft')).toBe('c')
      expect(await keys('Home')).toBe('a')
      expect(await keys('End')).toBe('c')
      await setup(toolbar('tablist nowrap'))
      await enter()
      expect(await keys('ArrowLeft')).toBe('a')
    })

    test('memory on re-entry; nomemory starts over; focusgroupstart', async () => {
      await setup(toolbar('toolbar'))
      await enter()
      await keys('ArrowRight')
      await keys('Tab')
      expect(await keys('Shift+Tab')).toBe('b')
      await setup(toolbar('toolbar nomemory'))
      await enter()
      await keys('ArrowRight', 'Tab')
      expect(await keys('Shift+Tab')).toBe('a')
      await setup(
        toolbar('toolbar').replace(
          '<button id="c">',
          '<button id="c" focusgroupstart>',
        ),
      )
      expect(await enter()).toBe('c')
    })

    test('disabled items and a nested focusgroup="none" are skipped', async () => {
      await setup(
        toolbar(
          'toolbar',
          '<button id="off" disabled>off</button><span focusgroup="none"><button id="out">out</button></span>',
        ),
      )
      await enter()
      expect(await keys('ArrowRight', 'ArrowRight')).toBe('c')
    })

    test('the implied role, never over an explicit one; RTL turns inline keys', async () => {
      await page.evaluate(() => {})
      await setup(
        toolbar('tablist') +
          '<div data-panel="focusgroup" focusgroup="toolbar" role="menubar"><button>x</button></div>',
      )
      expect(
        await page.evaluate(() => (window as any).library.roles()),
      ).toEqual(['tablist', 'menubar'])
      await setup(`<div dir="rtl">${toolbar('toolbar inline')}</div>`)
      await enter()
      expect(await keys('ArrowLeft')).toBe('b')
    })
  })
}

const tabsMarkup = (attrs = '') => `
  <button id="before">before</button>
  <div data-panel="tabs" ${attrs}>
    <ul>
      <li><a id="t1" href="#games">Games</a></li>
      <li><a id="t2" href="#screens">Screens</a></li>
      <li><a id="t3" href="#notes">Notes</a></li>
    </ul>
    <section id="games"><p>games</p></section>
    <section id="screens"><p>screens</p></section>
    <section id="notes"><p>notes</p></section>
  </div>`

for (const [name, engine] of engines) {
  describe(`tabs in ${name}`, () => {
    let browser: Browser
    let page: Page
    const call = (fn: string, arg?: unknown) =>
      page.evaluate(([f, a]) => (window as any).library[f as string](a), [
        fn,
        arg,
      ] as const)
    const state = () => call('tabsState')

    beforeAll(async () => {
      browser = await engine.launch()
      page = await browser.newPage()
      await page.setContent(
        '<!doctype html><title>library</title><body></body>',
      )
      await page.evaluate(async (code) => {
        const url = URL.createObjectURL(
          new Blob([code], { type: 'text/javascript' }),
        )
        ;(window as any).library = await import(url)
      }, code)
    })
    afterAll(async () => {
      await browser?.close()
    })

    test('layer 0: without the panel, every section shows', async () => {
      await call('plain', tabsMarkup())
      expect((await state()).shown).toEqual(['games', 'screens', 'notes'])
    })

    test('APG roles; one panel shown; arrows select (automatic)', async () => {
      await call('setup', tabsMarkup())
      const first = await state()
      expect(first.shown).toEqual(['games'])
      expect(first.roles).toEqual([
        'tablist',
        'presentation',
        'tab',
        'presentation',
        'tab',
        'presentation',
        'tab',
        'tabpanel',
        'tabpanel',
        'tabpanel',
      ])
      await page.focus('#before')
      await page.keyboard.press('Tab')
      await page.keyboard.press('ArrowRight')
      expect(await state()).toMatchObject({
        shown: ['screens'],
        selected: ['t2'],
      })
      await page.keyboard.press('Tab')
      expect(await page.evaluate(() => document.activeElement?.id)).toBe(
        'screens',
      )
    })

    test('manual: arrows move, Space or a click selects; no hash jump', async () => {
      await call('setup', tabsMarkup('data-tabs-activation="manual"'))
      await page.focus('#t1')
      await page.keyboard.press('ArrowRight')
      expect((await state()).shown).toEqual(['games'])
      await page.keyboard.press(' ')
      expect((await state()).shown).toEqual(['screens'])
      await page.click('#t3')
      expect(await state()).toMatchObject({ shown: ['notes'], hash: '' })
    })
  })
}
