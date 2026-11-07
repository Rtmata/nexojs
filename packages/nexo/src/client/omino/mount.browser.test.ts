/**
 * omino's client renderer in real engines (F.3): Chromium, WebKit and
 * Firefox through Playwright. The scenarios live in mount.fixture.tsx,
 * bundled once and imported into a blank page of each browser.
 */
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

async function bundle(): Promise<string> {
  const entry = new URL('./mount.fixture.tsx', import.meta.url).pathname
  const built = await Bun.build({ entrypoints: [entry], format: 'esm' })
  if (!built.success) throw new AggregateError(built.logs, 'bundle failed')
  return built.outputs[0]!.text()
}

const code = await bundle()

async function open(browser: Browser): Promise<Page> {
  const page = await browser.newPage()
  await page.setContent('<!doctype html><title>omino</title><body></body>')
  await page.evaluate(async (code) => {
    const url = URL.createObjectURL(
      new Blob([code], { type: 'text/javascript' }),
    )
    ;(window as any).scenarios = await import(url)
  }, code)
  return page
}

for (const [name, engine] of engines) {
  describe(`mount in ${name}`, () => {
    let browser: Browser
    let page: Page
    const play = (scenario: string) =>
      page.evaluate((s) => (window as any).scenarios[s](), scenario)

    beforeAll(async () => {
      browser = await engine.launch()
      page = await open(browser)
    })
    afterAll(async () => {
      await browser?.close()
    })

    test('elements, attributes and text', async () => {
      expect(await play('elementsAndText')).toBe(
        '<p class="note" data-n="3">hi <b>there</b> 0</p>',
      )
    })

    test('a text hole: right away at mount, then on the microtask, same node', async () => {
      expect(await play('textHole')).toEqual({
        first: '1',
        before: '1',
        after: '2',
        sameNode: true,
      })
    })

    test('a function is a hole', async () => {
      expect(await play('functionHole')).toBe('30')
    })

    test('attribute, class and style holes', async () => {
      expect(await play('attributeHoles')).toEqual({
        first:
          '<div title="a" class="base active" style="font-size: 10px; --accent: red;"></div>',
        after: '<div class="base" style="--accent: red;"></div>',
      })
    })

    test('value and checked are live properties', async () => {
      expect(await play('liveValue')).toEqual({
        value: 'from the signal',
        checked: true,
        attribute: null,
      })
    })

    test('prop: sets a property', async () => {
      expect(await play('propPrefix')).toEqual({
        first: [1, 2],
        after: [3],
        attribute: false,
      })
    })

    test('a hole returning JSX is a region', async () => {
      expect(await play('regionSwap')).toEqual({
        first: '<!----><b>B</b><!---->',
        after: '<!----><i>I</i><!---->',
      })
    })

    test('if is a presence hole, not recreated while true', async () => {
      expect(await play('presence')).toEqual({
        kept: true,
        gone: true,
        back: true,
      })
    })

    test('components: once, slots, context of holes, mounted children first, ended with their region', async () => {
      const result = await play('components')
      expect(result.html).toBe(
        '<div><section><h2>Ada</h2><small>foot</small><em>new</em></section></div>',
      )
      expect(result.title).toBe('Grace')
      expect(result.log).toEqual([
        'card template',
        'badge template',
        'badge mounted true',
        'card mounted',
        'badge ended',
      ])
    })

    test('ref runs once in the document and ends with it', async () => {
      expect(await play('refs')).toEqual(['input true', 'ref ended'])
    })

    test('listeners are removed with their life', async () => {
      expect(await play('listeners')).toEqual({ clicks: 1, removed: true })
    })

    test('mistakes are refused with a clear error', async () => {
      const caught = await play('errors')
      expect(caught).toHaveLength(6)
      expect(caught[0]).toContain('lowercase')
      expect(caught[1]).toContain('inline JavaScript')
      expect(caught[2]).toContain('script URL')
      expect(caught[3]).toContain("'font-size'")
      expect(caught[4]).toContain('<script>')
      expect(caught[5]).toContain('returned a promise')
    })

    test('svg namespaces, foreignObject and raw()', async () => {
      expect(await play('svgAndRaw')).toEqual({
        svg: 'http://www.w3.org/2000/svg',
        rect: 'http://www.w3.org/2000/svg',
        width: '20',
        p: 'http://www.w3.org/1999/xhtml',
        raw: 'trusted',
      })
    })

    test('the context reaches every template', async () => {
      expect(await play('context')).toBe('es')
    })

    test('For: a row per key, made once; a new object updates its row', async () => {
      expect(await play('forRows')).toEqual({
        text: ['0:Dune II', '1:Emma', '2:Kim'],
        made: [1, 2, 3],
        kept: true,
        same: true,
      })
    })

    test('For: a reorder moves the fewest nodes and keeps them', async () => {
      expect(await play('forReorder')).toEqual({
        text: ['0:b4', '1:b1', '2:b2', '3:b3'],
        sameNodes: true,
        moved: 1,
        made: [1, 2, 3, 4],
      })
    })

    test('For: a leaving row ends', async () => {
      expect(await play('forLeave')).toEqual({ ended: [1], text: ['2'] })
    })

    test('For: a SignalArray, keyed by the items', async () => {
      expect(await play('forSignalArray')).toEqual(['sent'])
    })

    test('For: by position, rows stay and their items change', async () => {
      expect(await play('forByPosition')).toEqual({
        text: ['b', 'a'],
        made: ['a', 'b'],
      })
    })

    test('For: two items with one key are an error', async () => {
      expect(await play('forDuplicate')).toContain('two items with the key 1')
    })

    test('exit: marked, inert, focus out, awaited, then removed', async () => {
      expect(await play('exitWithCss')).toEqual({
        during: { present: true, marked: true, inert: true, focusOut: true },
        after: true,
      })
    })

    test('a region swaps out-in by default, and only the latest comes in', async () => {
      expect(await play('swapOutIn')).toEqual({ during: 'a', after: 'c' })
    })

    test('Swap together: both while the old leaves', async () => {
      expect(await play('swapTogether')).toEqual({ during: 'ab', after: 'b' })
    })

    test('Swap in-out: the new comes first, the old leaves after', async () => {
      expect(await play('swapInOut')).toEqual({ during: 'ab', after: 'b' })
    })

    test('exit as a function is awaited, with signal and reducedMotion', async () => {
      expect(await play('exitFunction')).toEqual({
        seen: ['p', false, 'boolean'],
        during: true,
        after: true,
      })
    })

    test('exit-timeout ends an exit that never finishes', async () => {
      expect(await play('exitTimeout')).toEqual({ during: true, after: true })
    })

    test('For rows leave with their exit and come with their entry', async () => {
      expect(await play('rowsComeAndGo')).toEqual({
        during: ['1-', '2', '3+'],
        after: ['2', '3'],
      })
    })

    test('aborting the mount ends components and removes the content', async () => {
      expect(await play('abortEnds')).toEqual({
        log: ['ended'],
        empty: true,
        total: 1,
      })
    })
  })
}
