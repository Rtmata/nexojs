/**
 * glyph's CSS in real engines (G.2): Chromium, WebKit and Firefox through
 * Playwright, for what only a browser decides — the layer order,
 * `light-dark()` resolving by `color-scheme`, and themes nested in rooms. The CSS is made here, in Bun,
 * and put in a blank page as it is: nothing is bundled.
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
import { base } from './base'
import { colorMix } from './color/mix'
import { readColor } from './color/read'
import { reset } from './reset'
import { defineTheme } from './theme'
import { defineTokens } from './tokens'

/** Starting a browser can take longer than a test's default 5 s (Firefox did). */
const LAUNCH = 30_000

const engines: [string, BrowserType][] = [
  ['chromium', chromium],
  ['webkit', webkit],
  ['firefox', firefox],
]

const tokens = defineTokens({
  color: {
    text: { light: '#222', dark: '#eee' },
    surface: { light: '#fff', dark: '#111' },
    primary: '#2563eb',
    'on-primary': '#fff',
    border: '#ccc',
  },
  font: { body: 'serif', mono: 'monospace' },
})

/** A theme that fixes the dark scheme, and one that only changes colours (C.1–C.3). */
const night = defineTheme(tokens, 'night', { colorScheme: 'dark' })
const paper = defineTheme(tokens, 'paper', {
  color: { text: '#300', surface: '#ffe' },
})
/** A theme that takes the scheme of the room around it. */
const inner = defineTheme(tokens, 'inner', { colorScheme: 'inherit' })
/** A name with everything that could end its selector or its <style>. */
const odd = defineTheme(tokens, 'modo "noche" \\ </style>', {
  colorScheme: 'dark',
})

/**
 * glyph's sheets in the reverse of their layer order, then a probe that
 * names the layers the other way round: if the order line in glyph's
 * sheets didn't fix the order, the probe's first mention would.
 */
const PAGE = `<!doctype html><title>glyph</title>
<style>${base(tokens).css}</style>
<style>${tokens.css}</style>
<style>${reset.css}</style>
<style>${paper.css}</style>
<style>${night.css}</style>
<style>${inner.css}</style>
<style>${odd.css}</style>
<style>
  @layer glyph.recipes { .probe { color: rgb(0, 0, 1) } }
  @layer glyph.reset { #probe.probe { color: rgb(0, 0, 2) } }
  :where(.mine) { color: rgb(0, 0, 3) }
</style>
<p id="text">text</p>
<a id="link" href="#">link</a>
<p id="probe" class="probe">probe</p>
<a id="mine" class="mine" href="#">mine</a>
<div style="color-scheme: dark">
  <p id="inherits">inherits html's colour, resolved there</p>
  <p id="room" style="color: ${tokens.color.text}">uses the token here</p>
</div>
<p id="odd" data-theme="modo &quot;noche&quot; \\ &lt;/style&gt;">any text names a theme</p>
<span id="mix" style="color: color-mix(in oklch, #3b82f6 20%, white)">mix</span>
<section id="night" data-theme="night">
  <p id="night-text">a dark room</p>
  <section id="paper" data-theme="paper">
    <p id="paper-text">a paper room inside it</p>
  </section>
  <section id="inner" data-theme="inner">an inheriting room inside it</section>
</section>`

/** The computed value of `property` on `#id`. */
function computed(page: Page, id: string, property: string): Promise<string> {
  return page.evaluate(
    ([id, property]) =>
      getComputedStyle(document.getElementById(id!)!).getPropertyValue(
        property!,
      ),
    [id, property],
  )
}

/** A colour as 0–255 channels, read by glyph: engines serialize differently. */
function bytes(css: string): number[] {
  const { red, green, blue } = readColor(css)
  return [red, green, blue].map((c) => Math.round(c * 255))
}

for (const [name, engine] of engines) {
  describe(`glyph in ${name}`, () => {
    let browser: Browser
    let page: Page

    beforeAll(async () => {
      browser = await engine.launch()
      page = await browser.newPage()
      await page.setContent(PAGE)
    }, LAUNCH)
    afterAll(async () => {
      await browser?.close()
    })

    test('a { light, dark } token follows the system scheme (C.3)', async () => {
      await page.emulateMedia({ colorScheme: 'light' })
      expect(await computed(page, 'text', 'color')).toBe('rgb(34, 34, 34)')
      await page.emulateMedia({ colorScheme: 'dark' })
      expect(await computed(page, 'text', 'color')).toBe('rgb(238, 238, 238)')
      expect(await computed(page, 'text', 'background-color')).toBe(
        'rgba(0, 0, 0, 0)',
      )
    })

    test('…and the scheme where the token is used, not where it is defined', async () => {
      await page.emulateMedia({ colorScheme: 'light' })
      expect(await computed(page, 'room', 'color')).toBe('rgb(238, 238, 238)')
      // A property that inherits gets the value already resolved where it was set
      expect(await computed(page, 'inherits', 'color')).toBe('rgb(34, 34, 34)')
    })

    test('base reads the tokens', async () => {
      await page.emulateMedia({ colorScheme: 'light' })
      expect(await computed(page, 'link', 'color')).toBe('rgb(37, 99, 235)')
    })

    test("glyph's layer order holds whatever order its sheets come in (E.1)", async () => {
      expect(await computed(page, 'probe', 'color')).toBe('rgb(0, 0, 1)')
    })

    test('your unlayered CSS wins over every layer, specificity aside', async () => {
      expect(await computed(page, 'mine', 'color')).toBe('rgb(0, 0, 3)')
    })

    test("colorScheme: 'dark' flips the light-dark tokens, whatever the system says (C.3)", async () => {
      await page.emulateMedia({ colorScheme: 'light' })
      expect(await computed(page, 'night-text', 'color')).toBe(
        'rgb(238, 238, 238)',
      )
      expect(await computed(page, 'night', 'background-color')).toBe(
        'rgb(17, 17, 17)',
      )
    })

    test('a room inside another theme shows its own text and surface (C.1, C.2)', async () => {
      await page.emulateMedia({ colorScheme: 'light' })
      expect(await computed(page, 'paper-text', 'color')).toBe('rgb(51, 0, 0)')
      expect(await computed(page, 'paper', 'background-color')).toBe(
        'rgb(255, 255, 238)',
      )
      // Its light-dark tokens follow the system again, not the dark room around it
      expect(await computed(page, 'paper', 'color-scheme')).toBe('light dark')
    })

    test("colorScheme: 'inherit' takes the dark of the room around it (C.3)", async () => {
      await page.emulateMedia({ colorScheme: 'light' })
      expect(await computed(page, 'inner', 'color-scheme')).toBe('dark')
      expect(await computed(page, 'inner', 'color')).toBe('rgb(238, 238, 238)')
    })

    test('a theme named with quotes, a backslash and </style> still applies (C.1)', async () => {
      await page.emulateMedia({ colorScheme: 'light' })
      expect(await computed(page, 'odd', 'color')).toBe('rgb(238, 238, 238)')
    })

    test("colorMix computes what the browser's color-mix(in oklch) shows (C.5)", async () => {
      const shown = await computed(page, 'mix', 'color')
      expect(bytes(shown)).toEqual(bytes(colorMix('#3b82f6', 'white', 20)))
    })
  })
}
