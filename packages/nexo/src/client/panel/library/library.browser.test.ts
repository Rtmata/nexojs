/** The built-in panels (D.4) in real engines, with real keys (Playwright). */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from 'bun:test'
import {
  chromium,
  firefox,
  webkit,
  type Browser,
  type BrowserType,
  type Page,
} from 'playwright'

/** Starting a browser can take longer than a test's default 5 s (Firefox did). */
const LAUNCH = 30_000

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
    }, LAUNCH)
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
    }, LAUNCH)
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

const dialogMarkup = (closedby = '') => `
  <button id="open" commandfor="info" command="show-modal">info</button>
  <dialog id="info" data-panel="dialog" ${closedby}>
    <h2>Ys</h2><button id="inside">ok</button>
    <button id="shut" commandfor="info" command="close">close</button>
  </dialog>`

for (const [name, engine] of engines) {
  describe(`dialog in ${name}`, () => {
    let browser: Browser
    let page: Page
    const call = (fn: string, ...args: unknown[]) =>
      page.evaluate(
        ([f, a]) => (window as any).library[f as string](...(a as unknown[])),
        [fn, args] as const,
      )
    const state = () => call('dialogState')

    beforeAll(async () => {
      browser = await engine.launch()
    }, LAUNCH)
    beforeEach(async () => {
      page = await browser.newPage({ viewport: { width: 800, height: 600 } })
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

    test('native: commands open and close, focus returns; a name from its heading', async () => {
      await call('setup', dialogMarkup())
      await page.click('#open')
      expect(await state()).toMatchObject({
        open: true,
        labelledby: 'info-title',
      })
      await page.click('#shut')
      expect(await state()).toMatchObject({ open: false, focused: 'open' })
    })

    test('bridged: commands where the platform lacks them', async () => {
      await call('withoutPlatform', dialogMarkup(), ['command'])
      await page.click('#open')
      expect((await state()).open).toBe(true)
      await page.click('#shut')
      expect((await state()).open).toBe(false)
    })

    test('bridged: closedby="any" closes on the backdrop; "none" keeps Escape out', async () => {
      await call('withoutPlatform', dialogMarkup('closedby="any"'), [
        'closedBy',
      ])
      await page.click('#open')
      await page.mouse.click(5, 5)
      expect((await state()).open).toBe(false)
      await call('withoutPlatform', dialogMarkup('closedby="none"'), [
        'closedBy',
      ])
      await page.click('#open')
      await page.keyboard.press('Escape')
      expect((await state()).open).toBe(true)
    })
  })
}

const feedMarkup = `
  <button id="before">before</button>
  <section data-panel="feed" data-feed-total="4" aria-label="Shelf">
    <article id="g1"><h3>A</h3><a id="g1-link" href="#a">open</a></article>
    <article id="g2"><h3>B</h3></article>
    <article id="g3"><h3>C</h3></article>
  </section>
  <button id="after">after</button>`

for (const [name, engine] of engines) {
  describe(`feed in ${name}`, () => {
    let browser: Browser
    let page: Page
    const call = (fn: string, ...args: unknown[]) =>
      page.evaluate(
        ([f, a]) => (window as any).library[f as string](...(a as unknown[])),
        [fn, args] as const,
      )

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
    }, LAUNCH)
    afterAll(async () => {
      await browser?.close()
    })

    test('APG feed: roles and numbers, renumbered when articles arrive', async () => {
      await call('setup', feedMarkup)
      expect(await call('feedState')).toMatchObject({
        role: 'feed',
        numbers: ['1/4', '2/4', '3/4'],
      })
      await call('moreArticles')
      expect((await call('feedState')).numbers).toEqual([
        '1/4',
        '2/4',
        '3/4',
        '4/4',
      ])
    })

    test('Page Down/Up between articles; Ctrl+End/Home out of the feed', async () => {
      await call('setup', feedMarkup)
      await page.focus('#g1-link')
      await page.keyboard.press('PageDown')
      expect((await call('feedState')).focused).toBe('g2')
      await page.keyboard.press('PageUp')
      expect((await call('feedState')).focused).toBe('g1')
      await page.keyboard.press('Control+End')
      expect((await call('feedState')).focused).toBe('after')
      await page.focus('#g3')
      await page.keyboard.press('Control+Home')
      expect((await call('feedState')).focused).toBe('before')
    })
  })
}

for (const [name, engine] of engines) {
  describe(`requestCloseTop in ${name}`, () => {
    let browser: Browser
    let page: Page
    const call = (fn: string, ...args: unknown[]) =>
      page.evaluate(
        ([f, a]) => (window as any).library[f as string](...(a as unknown[])),
        [fn, args] as const,
      )

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
    }, LAUNCH)
    afterAll(async () => {
      await browser?.close()
    })

    test('the innermost first (a menu in a sheet), then the sheet, then nothing', async () => {
      await call(
        'plain',
        `
        <dialog id="sheet"><div id="menu" popover>menu</div></dialog>`,
      )
      await page.evaluate(() => {
        ;(document.getElementById('sheet') as HTMLDialogElement).showModal()
        document.getElementById('menu')!.showPopover()
      })
      expect(await call('closeTop')).toEqual({ result: true, open: ['sheet'] })
      expect(await call('closeTop')).toEqual({ result: true, open: [] })
      expect(await call('closeTop')).toEqual({ result: false, open: [] })
    })
  })
}

for (const [name, engine] of engines) {
  describe(`press-hold and confirm-on-hold in ${name}`, () => {
    let browser: Browser
    let page: Page
    const call = (fn: string, ...args: unknown[]) =>
      page.evaluate(
        ([f, a]) => (window as any).library[f as string](...(a as unknown[])),
        [fn, args] as const,
      )
    const hold = async (selector: string, ms: number, drift = 0) => {
      const box = (await page.locator(selector).boundingBox())!
      await page.mouse.move(box.x + 10, box.y + 10)
      await page.mouse.down()
      if (drift) await page.mouse.move(box.x + 10 + drift, box.y + 10)
      await page.waitForTimeout(ms)
      await page.mouse.up()
      await page.waitForTimeout(50)
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
    }, LAUNCH)
    afterAll(async () => {
      await browser?.close()
    })

    test('press-hold: a long press fires and swallows its click; short or wandering ones do not', async () => {
      await call(
        'setup',
        '<button id="item" data-panel="press-hold" style="width:200px;height:60px">item</button>',
      )
      await call('record')
      await hold('#item', 500)
      expect(await call('events')).toEqual(['press-hold:press mouse'])
      await call('record')
      await hold('#item', 100)
      expect(await call('events')).toEqual(['click'])
      await call('record')
      await hold('#item', 500, 40)
      expect(await call('events')).toEqual(['click']) // no long press: a plain click
      await call('record')
      await page.focus('#item')
      await page.keyboard.press('Shift+F10')
      expect(await call('events')).toEqual(['press-hold:press keyboard'])
    })

    test('confirm-on-hold: hold confirms, letting go early or a click does nothing', async () => {
      await call(
        'setup',
        '<button id="del" data-panel="confirm-on-hold" data-confirm-on-hold-duration="300" style="width:200px;height:60px">delete</button>',
      )
      await call('record')
      await hold('#del', 400)
      expect(await call('events')).toEqual(['confirm-on-hold:confirm'])
      await call('record')
      await hold('#del', 100)
      await page.click('#del')
      expect(await call('events')).toEqual([])
    })

    test('confirm-on-hold by keyboard: hold, or press to arm and press again (R.31)', async () => {
      await call(
        'setup',
        '<button id="del" data-panel="confirm-on-hold" data-confirm-on-hold-duration="300">delete</button>',
      )
      await call('record')
      await page.focus('#del')
      await page.keyboard.down(' ')
      await page.waitForTimeout(400)
      await page.keyboard.up(' ')
      expect(await call('events')).toEqual(['confirm-on-hold:confirm'])
      await call('record')
      await page.keyboard.press(' ')
      expect(await call('liveText')).toBe('Press again to confirm')
      await page.keyboard.press('Escape')
      await page.keyboard.press(' ')
      expect(await call('events')).toEqual([])
      await page.keyboard.press('Enter')
      expect(await call('events')).toEqual(['confirm-on-hold:confirm'])
    })
  })
}

for (const [name, engine] of engines) {
  describe(`gesture, slider, hover-intent, keymap in ${name}`, () => {
    let browser: Browser
    let page: Page
    const call = (fn: string, ...args: unknown[]) =>
      page.evaluate(
        ([f, a]) => (window as any).library[f as string](...(a as unknown[])),
        [fn, args] as const,
      )
    /** A drag of `steps` moves, `pause` ms apart: Playwright's own steps take no time. */
    const drag = async (dx: number, dy: number, steps: number, pause = 0) => {
      await page.mouse.move(100, 100)
      await page.mouse.down()
      for (let i = 1; i <= steps; i++) {
        await page.mouse.move(100 + (dx * i) / steps, 100 + (dy * i) / steps)
        if (pause) await page.waitForTimeout(pause)
      }
      await page.mouse.up()
    }

    beforeAll(async () => {
      browser = await engine.launch()
      page = await browser.newPage({ viewport: { width: 800, height: 600 } })
      await page.setContent(
        '<!doctype html><title>library</title><body style="margin:0"></body>',
      )
      await page.evaluate(async (code) => {
        const url = URL.createObjectURL(
          new Blob([code], { type: 'text/javascript' }),
        )
        ;(window as any).library = await import(url)
      }, code)
    }, LAUNCH)
    afterAll(async () => {
      await browser?.close()
    })

    test('gesture: a tap, a swipe right, nothing for a short slow drag', async () => {
      await call(
        'setup',
        '<div data-panel="gesture" data-gesture-axis="x" style="width:400px;height:300px"></div>',
      )
      await call('record')
      await page.mouse.click(100, 100)
      await drag(150, 5, 5)
      await drag(20, 0, 10, 30)
      const events = (await call('events')) as string[]
      expect(events.filter((e) => e.startsWith('gesture'))).toEqual([
        'gesture:tap',
        'gesture:swipe right',
      ])
      expect(await call('styleOf', 'div', 'touch-action')).toBe('pan-y')
    })

    test('slider: fill and valuetext; multi-thumb never crosses, bounds follow (APG)', async () => {
      await call(
        'setup',
        `
        <input id="one" type="range" min="0" max="10" value="5" data-panel="slider" data-slider-valuetext="{value} pts">
        <div id="two" data-panel="slider"><input id="lo" type="range" value="20"><input id="hi" type="range" value="60"></div>`,
      )
      expect(await call('styleOf', '#one', '--slider-fill')).toBe('50%')
      expect(await call('attributes', '#one', ['aria-valuetext'])).toEqual({
        'aria-valuetext': '5 pts',
      })
      await page.focus('#lo')
      await page.keyboard.press('End')
      expect(
        await page.evaluate(
          () => (document.getElementById('lo') as HTMLInputElement).value,
        ),
      ).toBe('60')
      expect(await call('attributes', '#lo', ['aria-valuemax'])).toEqual({
        'aria-valuemax': '60',
      })
      expect(await call('styleOf', '#two', '--slider-from')).toBe('60%')
    })

    test('hover-intent: a mouse that stays, then leaves; one passing through means nothing', async () => {
      await call(
        'setup',
        '<div id="card" data-panel="hover-intent" style="width:200px;height:200px"></div>',
      )
      await call('record')
      await page.mouse.move(50, 50)
      await page.waitForTimeout(350)
      await page.mouse.move(500, 500)
      await page.waitForTimeout(250)
      await page.mouse.move(50, 50)
      await page.waitForTimeout(60)
      await page.mouse.move(500, 500)
      await page.waitForTimeout(350)
      const events = (await call('events')) as string[]
      expect(events).toEqual(['hover-intent:enter', 'hover-intent:leave'])
    })

    test('keymap: keys to actions; typing in a field only counts with Ctrl', async () => {
      await call(
        'setup',
        `<div data-panel="keymap" data-keymap-keys='{"j":"next","ctrl+k":"search","?":"help"}'><button id="b">b</button><input id="field"></div>`,
      )
      await call('record')
      await page.focus('#b')
      await page.keyboard.press('j')
      await page.keyboard.press('Shift+?')
      await page.focus('#field')
      await page.keyboard.press('j')
      await page.keyboard.press('Control+k')
      const events = (await call('events')) as string[]
      expect(events.filter((e) => e.startsWith('keymap'))).toEqual([
        'keymap:action next',
        'keymap:action help',
        'keymap:action search',
      ])
    })
  })
}

for (const [name, engine] of engines) {
  describe(`indicator, tokens, replay, activity, text effects, sequence in ${name}`, () => {
    let browser: Browser
    let page: Page
    const call = (fn: string, ...args: unknown[]) =>
      page.evaluate(
        ([f, a]) => (window as any).library[f as string](...(a as unknown[])),
        [fn, args] as const,
      )
    const frames = () =>
      page.evaluate(
        () =>
          new Promise((done) =>
            requestAnimationFrame(() => requestAnimationFrame(done)),
          ),
      )

    beforeAll(async () => {
      browser = await engine.launch()
      page = await browser.newPage({ viewport: { width: 800, height: 600 } })
      await page.setContent(
        '<!doctype html><title>library</title><body style="margin:0"></body>',
      )
      await page.evaluate(async (code) => {
        const url = URL.createObjectURL(
          new Blob([code], { type: 'text/javascript' }),
        )
        ;(window as any).library = await import(url)
      }, code)
    }, LAUNCH)
    afterAll(async () => {
      await browser?.close()
    })
    beforeEach(async () => {
      await page.emulateMedia({ reducedMotion: 'no-preference' })
    })

    test("indicator: the active item's box, again when another becomes active", async () => {
      await call(
        'setup',
        `<div id="bar" data-panel="indicator" style="display:flex;margin-left:20px">
          <button id="one" style="width:50px;padding:0;border:0">a</button>
          <button id="two" aria-selected="true" style="width:80px;padding:0;border:0">b</button>
        </div>`,
      )
      const box = () =>
        ['x', 'width'].map((n) => call('styleOf', '#bar', `--indicator-${n}`))
      expect(await Promise.all(box())).toEqual(['50px', '80px'])
      await page.evaluate(() => {
        document.querySelector('#two')!.setAttribute('aria-selected', 'false')
        document.querySelector('#one')!.setAttribute('aria-selected', 'true')
      })
      await frames()
      expect(await Promise.all(box())).toEqual(['0px', '50px'])
    })

    test('tokens: custom properties from params, removed when the panel ends', async () => {
      const html = `<div id="t" data-panel="tokens" data-tokens-values='{"accent":"#e3b341","gap":"1rem"}'></div>`
      await call('setup', html)
      expect(await call('styleOf', '#t', '--accent')).toBe('#e3b341')
      expect(await call('styleOf', '#t', '--gap')).toBe('1rem')
      await call('setupAndEnd', html)
      expect(await call('styleOf', '#t', '--accent')).toBe('')
    })

    test('replay: the animation starts over on its event', async () => {
      await call(
        'setup',
        `<style>@keyframes grow { to { scale: 2 } }</style>
         <button id="r" data-panel="replay" data-replay-on="click" style="animation: grow 2s">r</button>`,
      )
      await page.waitForTimeout(400)
      expect(await call('animationTime', '#r')).toBeGreaterThan(300)
      await page.click('#r')
      expect(await call('animationTime', '#r')).toBeLessThan(150)
    })

    test('activity: active, idle after the timeout, active again on a stir', async () => {
      await call('record')
      await call(
        'setup',
        '<div id="here" data-panel="activity" data-activity-idle="150" style="width:300px;height:300px"></div>',
      )
      expect(await call('attributes', '#here', ['data-activity'])).toEqual({
        'data-activity': 'active',
      })
      await page.waitForTimeout(300)
      await page.mouse.move(50, 50)
      await page.mouse.move(60, 60)
      expect(await call('events')).toEqual([
        'activity:change active',
        'activity:change idle',
        'activity:change active',
      ])
    })

    test('typewriter: types for the eye, the whole text for assistive technology', async () => {
      await call('record')
      await call(
        'setup',
        '<p id="p" data-panel="typewriter" data-typewriter-speed="40">Hello there</p>',
      )
      await page.waitForTimeout(100)
      const during = (await call('texts', '#p')) as {
        spoken: string
        shown: string
      }
      expect(during.spoken).toBe('Hello there')
      expect(during.shown.length).toBeGreaterThan(0)
      expect(during.shown.length).toBeLessThan(11)
      await page.waitForTimeout(600)
      expect(await call('texts', '#p')).toEqual({
        spoken: 'Hello there',
        shown: null,
      })
      expect(await call('events')).toEqual(['typewriter:done'])
    })

    test('decode: scrambled with spaces kept, then the text; reduced motion shows it at once', async () => {
      await call('record')
      await call(
        'setup',
        '<p id="p" data-panel="decode" data-decode-duration="300" data-decode-charset="#">ab cd</p>',
      )
      await page.waitForTimeout(30)
      const during = (await call('texts', '#p')) as {
        spoken: string
        shown: string
      }
      expect(during.spoken).toBe('ab cd')
      expect(during.shown).toMatch(/^[a-d#]{2} [a-d#]{2}$/)
      expect(during.shown).toContain('#')
      await page.waitForTimeout(500)
      expect(await call('texts', '#p')).toEqual({
        spoken: 'ab cd',
        shown: null,
      })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await call('setup', '<p id="q" data-panel="decode">ab cd</p>')
      expect(await call('texts', '#q')).toEqual({
        spoken: 'ab cd',
        shown: null,
      })
      expect(await call('events')).toEqual(['decode:done', 'decode:done'])
    })

    test('sequence: each phase waits for its animation and for waitUntil', async () => {
      await call('record')
      await call(
        'setup',
        `<style>@keyframes fade { to { opacity: 0 } }
           [data-phase=out], [data-phase=in] { animation: fade 120ms }</style>
         <article id="s" data-panel="sequence" data-sequence-phases='["out","step","in"]'>page</article>`,
      )
      const started = Date.now()
      await call('startSequence', '#s')
      expect(await call('phaseOf', '#s')).toBe('out')
      await page.waitForFunction(() =>
        (window as any).events.includes('sequence:done'),
      )
      expect(Date.now() - started).toBeGreaterThan(300)
      expect(await call('events')).toEqual([
        'sequence:phase out',
        'sequence:phase step',
        'sequence:phase in',
        'sequence:done',
      ])
      expect(await call('phaseOf', '#s')).toBe(null)
    })
  })
}

for (const [name, engine] of engines) {
  describe(`listbox in ${name}`, () => {
    let browser: Browser
    let page: Page
    const call = (fn: string, ...args: unknown[]) =>
      page.evaluate(
        ([f, a]) => (window as any).library[f as string](...(a as unknown[])),
        [fn, args] as const,
      )
    const platforms = (attrs = '') => `
      <ul id="lb" data-panel="listbox" aria-label="Platform" ${attrs}>
        <li data-value="snes">SNES</li><li>Mega Drive</li>
        <li aria-disabled="true">Jaguar</li><li>PC Engine</li><li>Playdia</li>
      </ul>`

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
    }, LAUNCH)
    afterAll(async () => {
      await browser?.close()
    })

    test('single: roles, focus on the list, arrows select, typeahead, disabled skipped', async () => {
      await call('record')
      await call('setup', platforms())
      await page.focus('#lb')
      expect(await call('listboxState')).toEqual({
        role: 'listbox',
        multi: null,
        selected: [],
        active: 'SNES',
        named: true,
      })
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('ArrowDown')
      expect(await call('listboxState')).toMatchObject({
        selected: ['PC Engine'],
        active: 'PC Engine',
      })
      await page.keyboard.press('p')
      expect(await call('listboxState')).toMatchObject({
        selected: ['Playdia'],
      })
      await page.keyboard.press('Home')
      await page.click('#lb li:nth-child(2)')
      expect(
        ((await call('events')) as string[]).filter((e) =>
          e.startsWith('listbox'),
        ),
      ).toEqual([
        'listbox:change Mega Drive',
        'listbox:change PC Engine',
        'listbox:change Playdia',
        'listbox:change snes',
        'listbox:change Mega Drive',
      ])
    })

    test('multiple: Space, Shift+arrows, Shift+Space, Ctrl+A', async () => {
      await call('setup', platforms('data-listbox-multiple'))
      await page.focus('#lb')
      await page.keyboard.press('Space')
      await page.keyboard.press('Shift+ArrowDown')
      expect(await call('listboxState')).toMatchObject({
        multi: 'true',
        selected: ['SNES', 'Mega Drive'],
      })
      await page.keyboard.press('Space')
      await page.keyboard.press('End')
      await page.keyboard.press('Shift+Space')
      expect((await call('listboxState')).selected).toEqual([
        'SNES',
        'Mega Drive',
        'PC Engine',
        'Playdia',
      ])
      await page.keyboard.press('ControlOrMeta+a')
      expect((await call('listboxState')).selected).toEqual([])
      await page.keyboard.press('ControlOrMeta+a')
      expect((await call('listboxState')).selected).toEqual([
        'SNES',
        'Mega Drive',
        'PC Engine',
        'Playdia',
      ])
    })

    test('ended: back to the plain list', async () => {
      await call('setupAndEnd', platforms())
      expect(
        await call('attributes', '#lb', [
          'role',
          'tabindex',
          'aria-activedescendant',
        ]),
      ).toEqual({
        role: null,
        tabindex: null,
        'aria-activedescendant': null,
      })
      expect(
        await call('attributes', '#lb li', ['role', 'aria-selected']),
      ).toEqual({ role: null, 'aria-selected': null })
    })
  })
}
