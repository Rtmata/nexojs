/** The built-in panels in real engines, with real keys (Playwright). */
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

    test('arrows stay with a bare contenteditable item: typing there moves the caret, not the focus', async () => {
      await setup(
        toolbar(
          'toolbar inline',
          '<div id="ed" contenteditable tabindex="-1">edit</div>',
        ),
      )
      await page.focus('#ed')
      expect(await keys('ArrowRight')).toBe('ed')
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

    test('confirm-on-hold by keyboard: hold, or press to arm and press again', async () => {
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

    test('keymap: a bare contenteditable is typing too; ctrl++ binds the plus key', async () => {
      await call(
        'setup',
        `<div data-panel="keymap" data-keymap-keys='{"j":"next","ctrl++":"zoom"}'><div id="ed" contenteditable>x</div><button id="b">b</button></div>`,
      )
      await call('record')
      await page.focus('#ed')
      await page.keyboard.press('j')
      await page.evaluate(() =>
        document.getElementById('b')!.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: '+',
            ctrlKey: true,
            bubbles: true,
            cancelable: true,
          }),
        ),
      )
      const events = (await call('events')) as string[]
      expect(events.filter((e) => e.startsWith('keymap'))).toEqual([
        'keymap:action zoom',
      ])
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

    test('reveal: data-in-view while the element is in view (theater inView)', async () => {
      await call(
        'setup',
        '<div style="height: 3000px"></div><section id="s" data-panel="reveal">s</section>',
      )
      const marked = () =>
        page.evaluate(() =>
          document.getElementById('s')!.hasAttribute('data-in-view'),
        )
      expect(await marked()).toBe(false)
      await page.evaluate(() => document.getElementById('s')!.scrollIntoView())
      await page.waitForFunction(() =>
        document.getElementById('s')!.hasAttribute('data-in-view'),
      )
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.waitForFunction(
        () => !document.getElementById('s')!.hasAttribute('data-in-view'),
      )
    })

    test('drag: the element follows the pointer along its axis (theater drag)', async () => {
      await call(
        'setup',
        '<div id="d" data-panel="drag" data-drag-axis="x" style="width: 200px; height: 80px; background: #ccc">d</div>',
      )
      const box = (await page.locator('#d').boundingBox())!
      await page.mouse.move(box.x + 20, box.y + 20)
      await page.mouse.down()
      await page.mouse.move(box.x + 80, box.y + 60, { steps: 4 })
      const translate = await page.evaluate(
        () => document.getElementById('d')!.style.translate,
      )
      await page.mouse.up()
      expect(translate).toBe('60px') // browsers write '60px 0px' as '60px'
    })

    test('pinch: two pointers twice as far apart double the scale (theater pinch)', async () => {
      await call(
        'setup',
        '<div id="z" data-panel="pinch" style="width: 200px; height: 200px">z</div>',
      )
      const scale = await page.evaluate(() => {
        const z = document.getElementById('z')!
        const touch = (
          target: EventTarget,
          type: string,
          id: number,
          x: number,
        ) =>
          target.dispatchEvent(
            new PointerEvent(type, {
              pointerId: id,
              clientX: x,
              clientY: 50,
              pointerType: 'touch',
              bubbles: true,
            }),
          )
        touch(z, 'pointerdown', 1, 10)
        touch(z, 'pointerdown', 2, 60)
        touch(document, 'pointermove', 2, 110)
        return z.style.scale
      })
      expect(scale).toBe('2')
    })

    test('parallax: the layer lags as the page scrolls (theater parallax)', async () => {
      await call(
        'setup',
        '<div style="height: 1200px"></div><div id="p" data-panel="parallax" data-parallax-depth="0.2" style="height: 100px">p</div><div style="height: 2000px"></div>',
      )
      await page.evaluate(async () => {
        document.getElementById('p')!.scrollIntoView({ block: 'center' })
        for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame)
      })
      const translate = await page.evaluate(
        () => getComputedStyle(document.getElementById('p')!).translate,
      )
      expect(translate).not.toBe('none')
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
        '<p id="p" data-panel="typewriter" data-typewriter-interval="40">Hello there</p>',
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

    test('decode follows the page speed, as typewriter does', async () => {
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      await call('record')
      await call(
        'setup',
        '<div style="--theater-speed: 4"><p data-panel="decode" data-decode-duration="800">ab</p></div>',
      )
      await page.waitForTimeout(400) // 800 ms at four times the speed: done at 200
      expect(await call('events')).toEqual(['decode:done'])
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
        'click', // the --start command button (Invoker Commands)
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

for (const [name, engine] of engines) {
  describe(`combobox in ${name}`, () => {
    let browser: Browser
    let page: Page
    const call = (fn: string, ...args: unknown[]) =>
      page.evaluate(
        ([f, a]) => (window as any).library[f as string](...(a as unknown[])),
        [fn, args] as const,
      )
    /** The combobox's events and the select's `change`s (the made input's own `change` is native, left alone). */
    const changes = async () =>
      ((await call('events')) as string[]).filter(
        (e) => e.startsWith('combobox') || /^change (snes|md|pce)$/.test(e),
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

    test('free text: the app fills the list as you type; arrows, Enter, Escape (APG)', async () => {
      await call('record')
      await call(
        'setup',
        `<form><input id="q" name="q" data-panel="combobox" data-combobox-filter="none" aria-controls="titles" aria-label="Search">
         <ul id="titles" hidden></ul></form>`,
      )
      await call('suggestOnInput', '#q', '#titles', ['Ys', 'Ys II', 'Zelda'])
      await page.focus('#q')
      await page.keyboard.type('ys')
      expect(await call('comboState')).toEqual({
        value: 'ys',
        expanded: 'true',
        shown: ['Ys', 'Ys II'],
        active: null,
        named: null,
      })
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('ArrowDown')
      expect(await call('comboState')).toMatchObject({
        active: 'Ys II',
        named: true,
      })
      await page.keyboard.press('Enter')
      expect(await call('comboState')).toMatchObject({
        value: 'Ys II',
        expanded: 'false',
        shown: [],
      })
      await page.keyboard.press('Escape')
      expect(await call('comboState')).toMatchObject({ value: '' })
      expect(await changes()).toEqual(['combobox:change Ys II'])
    })

    test('a select becomes a filterable select, and stays the form value', async () => {
      await call('record')
      await call(
        'setup',
        `<label for="plat">Platform</label>
         <select id="plat" name="platform" data-panel="combobox">
           <option value="snes">SNES</option><option value="md">Mega Drive</option><option value="pce">PC Engine</option>
         </select><button id="away">away</button>`,
      )
      expect(await call('selectState', '#plat')).toEqual({
        value: 'snes',
        hidden: true,
        labelled: true,
      })
      expect(await call('comboState')).toMatchObject({
        value: 'SNES',
        expanded: 'false',
      })
      await page.click('[role=combobox]', { clickCount: 3 })
      await page.keyboard.type('mega')
      expect(await call('comboState')).toMatchObject({ shown: ['Mega Drive'] })
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('Enter')
      expect(await call('selectState', '#plat')).toMatchObject({ value: 'md' })
      await page.keyboard.press('ControlOrMeta+a')
      await page.keyboard.type('nothing like it')
      await page.focus('#away')
      expect(await call('comboState')).toMatchObject({ value: 'Mega Drive' })
      await page.click('[role=combobox]', { clickCount: 3 })
      await page.keyboard.type('pc engine')
      await page.focus('#away')
      expect(await call('selectState', '#plat')).toMatchObject({ value: 'pce' })
      expect(await changes()).toEqual([
        'change md',
        'combobox:change Mega Drive',
        'change pce',
        'combobox:change PC Engine',
      ])
    })

    test('both: the rest written in and selected, taken when focus leaves', async () => {
      await call('record')
      await call(
        'setup',
        `<input id="q" data-panel="combobox" aria-autocomplete="both" aria-controls="titles" aria-label="Search">
         <ul id="titles" hidden><li>Ys</li><li>Ys II</li><li>Zelda</li></ul><button id="away">away</button>`,
      )
      await page.focus('#q')
      await page.keyboard.type('ze')
      expect(await call('comboState')).toMatchObject({
        value: 'zelda',
        shown: ['Zelda'],
        active: 'Zelda',
      })
      expect(await call('selectedText')).toBe('lda')
      await page.focus('#away')
      expect(await call('comboState', '#q')).toMatchObject({ value: 'Zelda' })
      expect(await changes()).toEqual(['combobox:change Zelda'])
    })

    test('ended: the select is back as the server sent it', async () => {
      await call(
        'setupAndEnd',
        `<label for="plat">Platform</label>
         <select id="plat" data-panel="combobox"><option value="snes">SNES</option></select>`,
      )
      expect(await call('attributes', 'select', ['hidden'])).toEqual({
        hidden: null,
      })
      expect(await call('attributes', 'label', ['for'])).toEqual({
        for: 'plat',
      })
      expect(
        await page.evaluate(
          () => document.querySelectorAll('input, ul').length,
        ),
      ).toBe(0)
    })

    test('refused where ARIA forbids it: type=search may only be a searchbox', async () => {
      expect(
        await call(
          'setupError',
          '<input type="search" data-panel="combobox" aria-controls="x"><ul id="x"></ul>',
        ),
      ).toContain('<input type="search">')
    })
  })
}

for (const [name, engine] of engines) {
  describe(`menu in ${name}`, () => {
    let browser: Browser
    let page: Page
    const call = (fn: string, ...args: unknown[]) =>
      page.evaluate(
        ([f, a]) => (window as any).library[f as string](...(a as unknown[])),
        [fn, args] as const,
      )
    const press = async (key: string) => {
      await page.keyboard.press(key)
      await call('settled')
    }
    const state = () =>
      call('menuState') as Promise<{
        focused: string
        open: string[]
        expanded: string[]
      }>
    const actions = `
      <button id="more" commandfor="acts" command="toggle-popover">More</button>
      <div id="acts" data-panel="menu" popover>
        <button>Favorite</button>
        <button id="export" commandfor="formats" command="toggle-popover">Export</button>
        <div id="formats" popover><button data-value="json">JSON</button><button>CSV</button></div>
        <hr>
        <button role="menuitemcheckbox">Subtitles</button>
        <div role="group"><button role="menuitemradio" aria-checked="true">Small</button><button role="menuitemradio">Large</button></div>
      </div>
      <button id="away">away</button>`

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

    test('menu button: opens on the first item; submenus by → and ←; Escape back to the button', async () => {
      await call('setup', actions)
      expect(await call('rolesOf', '#acts, #formats, #acts button')).toEqual([
        'menu',
        'menuitem',
        'menuitem',
        'menu',
        'menuitem',
        'menuitem',
        'menuitemcheckbox',
        'menuitemradio',
        'menuitemradio',
      ])
      await page.click('#more')
      await call('settled')
      expect(await state()).toEqual({
        focused: 'Favorite',
        open: ['acts'],
        expanded: ['more:true', 'export:false'],
      })
      await press('ArrowDown')
      await press('ArrowRight')
      expect(await state()).toMatchObject({
        focused: 'JSON',
        open: ['acts', 'formats'],
      })
      await press('ArrowDown')
      await press('ArrowLeft')
      expect(await state()).toMatchObject({ focused: 'export', open: ['acts'] })
      await press('Escape')
      expect(await state()).toMatchObject({ focused: 'more', open: [] })
      await press('ArrowUp')
      expect(await state()).toMatchObject({ focused: 'Large', open: ['acts'] })
      await press('Escape')
    })

    test('choosing: Enter closes everything and says what; Space flips a checkable and stays', async () => {
      await call('record')
      await call('setup', actions)
      await page.focus('#more')
      await press('ArrowDown')
      await press('ArrowDown')
      await press('Enter')
      expect(await state()).toMatchObject({
        focused: 'JSON',
        open: ['acts', 'formats'],
      })
      await press('Enter')
      expect(await state()).toMatchObject({ focused: 'more', open: [] })
      await press('ArrowUp')
      await press('Space')
      await press('ArrowUp')
      await press('ArrowUp')
      await press('Space')
      await press('Space')
      await press('ArrowDown')
      expect(await state()).toMatchObject({ focused: 'Small', open: ['acts'] })
      await press('Enter')
      const chosen = ((await call('events')) as string[]).filter((e) =>
        e.startsWith('menu'),
      )
      expect(chosen).toEqual([
        'menu:select json',
        'menu:select Large=true',
        'menu:select Subtitles=true',
        'menu:select Subtitles=false',
        'menu:select Small=true',
      ])
      expect(await state()).toMatchObject({ focused: 'more', open: [] })
    })

    test('Escape in a submenu closes only it, back on its item', async () => {
      await call('setup', actions)
      await page.focus('#more')
      await press('ArrowDown')
      await press('ArrowDown')
      await press('ArrowRight')
      await press('Escape')
      expect(await state()).toMatchObject({ focused: 'export', open: ['acts'] })
      await press('Escape')
      expect(await state()).toMatchObject({ focused: 'more', open: [] })
    })

    test('typeahead; Tab leaves and closes every menu', async () => {
      await call('setup', actions)
      await page.focus('#more')
      await press('ArrowDown')
      await press('s')
      expect((await state()).focused).toBe('Subtitles')
      await press('Tab')
      expect((await state()).open).toEqual([])
    })

    test('menubar: one tab stop, ← → along it, ↓ into a menu, ← → from a menu to the next', async () => {
      await call(
        'setup',
        `<div data-panel="menu" aria-label="Main">
          <button commandfor="file" command="toggle-popover">File</button>
          <div id="file" popover><button>New</button><button>Open</button></div>
          <button commandfor="edit" command="toggle-popover">Edit</button>
          <div id="edit" popover><button>Undo</button></div>
          <button>Help</button>
        </div>`,
      )
      expect(await call('rolesOf', '[data-panel=menu]')).toEqual(['menubar'])
      await page.keyboard.press('Tab')
      expect((await state()).focused).toBe('File')
      await press('ArrowRight')
      await press('ArrowDown')
      expect(await state()).toMatchObject({ focused: 'Undo', open: ['edit'] })
      await press('ArrowRight')
      expect(await state()).toMatchObject({ focused: 'Help', open: [] })
      await press('ArrowLeft')
      await press('ArrowDown')
      await press('ArrowLeft')
      expect(await state()).toMatchObject({ focused: 'New', open: ['file'] })
      await press('Escape')
      expect(await state()).toMatchObject({ focused: 'File', open: [] })
    })

    test('bridged: commandfor works where the platform lacks it', async () => {
      await call('withoutPlatform', actions, ['command'])
      await page.click('#more')
      await call('settled')
      expect(await state()).toMatchObject({
        focused: 'Favorite',
        open: ['acts'],
      })
      await page.click('#more')
      await call('settled')
      expect((await state()).open).toEqual([])
    })
  })
}

for (const [name, engine] of engines) {
  describe(`tooltip in ${name}`, () => {
    let browser: Browser
    let page: Page
    const call = (fn: string, ...args: unknown[]) =>
      page.evaluate(
        ([f, a]) => (window as any).library[f as string](...(a as unknown[])),
        [fn, args] as const,
      )
    const open = async () =>
      ((await call('tipState')) as { open: boolean }).open
    const tip = (content: string) => `
      <button id="info" interestfor="tip" style="position:fixed;left:0;top:0;width:60px;height:30px">i</button>
      <div id="tip" popover="hint" data-panel="tooltip" style="position:fixed;inset:auto;left:300px;top:300px;margin:0;width:100px;height:40px">${content}</div>
      <button id="away" style="position:fixed;left:0;top:500px">away</button>`

    beforeAll(async () => {
      browser = await engine.launch()
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
    }, LAUNCH)
    afterAll(async () => {
      await browser?.close()
    })

    test('hover: after a moment; kept on the tooltip itself (WCAG 1.4.13); lost after leaving both', async () => {
      await page.mouse.move(700, 100)
      await call('record')
      await call('setup', tip('Released in 1987'))
      await page.mouse.move(30, 15)
      await page.waitForTimeout(200)
      expect(await open()).toBe(false)
      await page.waitForTimeout(600)
      expect(await open()).toBe(true)
      await page.mouse.move(350, 320)
      await page.waitForTimeout(600)
      expect(await open()).toBe(true)
      await page.mouse.move(700, 100)
      await page.waitForTimeout(600)
      expect(await open()).toBe(false)
      expect(await call('events')).toEqual(['interest', 'loseinterest'])
    })

    test('focus shows it, Escape loses it at once', async () => {
      await page.mouse.move(700, 100)
      await call('setup', tip('Released in 1987'))
      await page.focus('#info')
      await page.waitForTimeout(800)
      expect(await open()).toBe(true)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(20)
      expect(await open()).toBe(false)
    })

    test("the mapping: the platform's own, or the bridge's copy of it", async () => {
      await call('setup', tip('Released in 1987'))
      const plain = await call('tipState')
      await call('setup', tip('Released in 1987. <a href="#more">More</a>'))
      await page.focus('#info')
      await page.waitForTimeout(800)
      const rich = await call('tipState')
      if (await call('nativeInterest')) {
        expect(plain).toMatchObject({ describedby: null, role: null })
        expect(rich).toMatchObject({ open: true, details: null })
        return
      }
      expect(plain).toMatchObject({
        describedby: 'tip',
        role: null,
        details: null,
      })
      expect(rich).toMatchObject({
        open: true,
        role: 'tooltip',
        details: 'tip',
        expanded: 'true',
      })
    })
  })
}

for (const [name, engine] of engines) {
  describe(`toast in ${name}`, () => {
    let browser: Browser
    let page: Page
    const call = (fn: string, ...args: unknown[]) =>
      page.evaluate(
        ([f, a]) => (window as any).library[f as string](...(a as unknown[])),
        [fn, args] as const,
      )
    const region = (attrs = '', inside = '') => `
      <button id="away" style="position:fixed;left:0;top:0">away</button>
      <div id="page" data-panel="toast" aria-label="Avisos" data-toast-close="Cerrar" ${attrs}
          style="position:fixed;right:0;bottom:0;width:300px;min-height:100px;margin:0">${inside}</div>`
    const later = (ms: number) => page.waitForTimeout(ms)

    beforeAll(async () => {
      browser = await engine.launch()
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
    }, LAUNCH)
    afterAll(async () => {
      await browser?.close()
    })

    test("persistent: the server's message and the app's stay until closed", async () => {
      await call('record')
      await call('setup', region('', '<p>Guardado</p>'))
      expect(await call('attributes', '#page', ['role'])).toEqual({
        role: 'log',
      })
      await call('say', 'Agregado a favoritos <button>Deshacer</button>')
      await later(300)
      expect(await call('messages')).toEqual([
        'Guardado [Cerrar]',
        'Agregado a favoritos Deshacer [Cerrar]',
      ])
      await page.click('#page p:nth-child(2) [data-toast-dismiss]')
      await later(50)
      expect(await call('messages')).toEqual(['Guardado [Cerrar]'])
      expect(
        ((await call('events')) as string[]).filter((e) =>
          e.startsWith('toast'),
        ),
      ).toEqual(['toast:dismiss Agregado a favoritos Deshacer close'])
    })

    test('duration: plain messages leave by themselves, paused under the pointer; one with controls stays', async () => {
      await page.mouse.move(10, 300)
      await call('setup', region('data-toast-duration="250"'))
      await call('say', 'Copiado')
      await call('say', 'Borrado <button>Deshacer</button>')
      await later(450)
      expect(await call('messages')).toEqual(['Borrado Deshacer [Cerrar]'])
      await page.mouse.move(700, 580)
      await call('say', 'Descargado')
      await later(450)
      expect((await call('messages')) as string[]).toContain(
        'Descargado [Cerrar]',
      )
      await page.mouse.move(10, 300)
      await later(450)
      expect(await call('messages')).toEqual(['Borrado Deshacer [Cerrar]'])
    })

    test('a message the app takes away itself tells no timeout later', async () => {
      await page.mouse.move(10, 300)
      await call('setup', region('data-toast-duration="200"'))
      await call('record')
      await call('say', 'Copiado')
      await page.evaluate(() => document.querySelector('#page > *')!.remove())
      await later(400)
      const events = (await call('events')) as string[]
      expect(events.filter((e) => e.startsWith('toast:dismiss'))).toEqual([])
    })

    test('closing keeps focus in the region; F8 reaches the region', async () => {
      await call('setup', region('', '<p>Uno</p><p>Dos</p>'))
      await page.focus('#page p:first-child [data-toast-dismiss]')
      await page.keyboard.press('Enter')
      await later(50)
      expect(
        await page.evaluate(
          () => document.activeElement?.closest('p')?.textContent,
        ),
      ).toContain('Dos')
      await page.focus('#away')
      await page.keyboard.press('F8')
      expect(await page.evaluate(() => document.activeElement?.id)).toBe('page')
    })

    test('a modal dialog holds its own region; toastRegion() and F8 follow the top modal', async () => {
      await call(
        'setup',
        region() +
          `<dialog id="info"><button id="fav">Favorito</button><div id="in-info" data-panel="toast" aria-label="Avisos"></div></dialog>`,
      )
      expect(await call('regionInUse')).toBe('page')
      await call('openModal', 'info')
      expect(await call('regionInUse')).toBe('in-info')
      await call('say', 'Agregado a favoritos')
      expect(await call('messages', '#in-info')).toEqual([
        'Agregado a favoritos [Close]',
      ])
      await page.keyboard.press('F8')
      expect(await page.evaluate(() => document.activeElement?.id)).toBe(
        'in-info',
      )
    })

    test('ended: the region as the server sent it', async () => {
      await call('setupAndEnd', region('', '<p>Guardado</p>'))
      expect(await call('attributes', '#page', ['role', 'tabindex'])).toEqual({
        role: null,
        tabindex: null,
      })
      expect(await call('messages')).toEqual(['Guardado'])
    })
  })
}

for (const [name, engine] of engines) {
  describe(`accordion, switch and alert dialogs in ${name}`, () => {
    let browser: Browser
    let page: Page
    const call = (fn: string, ...args: unknown[]) =>
      page.evaluate(
        ([f, a]) => (window as any).library[f as string](...(a as unknown[])),
        [fn, args] as const,
      )
    const faq = (attrs = 'data-accordion-remember') => `
      <div id="faq" data-panel="accordion" ${attrs}>
        <details name="faq" id="controls"><summary>Controls</summary><p>Arrows</p></details>
        <details name="faq" id="credits"><summary>Credits</summary><p>Falcom</p></details>
      </div>`

    /** `sessionStorage` needs a real origin: a blank page served over HTTP. */
    let server: ReturnType<typeof Bun.serve>

    beforeAll(async () => {
      const html = { 'content-type': 'text/html; charset=utf-8' }
      const blank = '<!doctype html><title>library</title><body></body>'
      server = Bun.serve({
        port: 0,
        fetch: () => new Response(blank, { headers: html }),
      })
      browser = await engine.launch()
      page = await browser.newPage()
      await page.goto(server.url.href)
      await page.evaluate(async (code) => {
        const url = URL.createObjectURL(
          new Blob([code], { type: 'text/javascript' }),
        )
        ;(window as any).library = await import(url)
      }, code)
    }, LAUNCH)
    afterAll(async () => {
      await browser?.close()
      await server?.stop()
    })

    test('accordion: native details name keeps one open; the panel remembers it for the session', async () => {
      await page.evaluate(() => sessionStorage.clear())
      await call('record')
      await call('setup', faq())
      await page.click('#controls summary')
      expect(await call('openSections')).toEqual(['controls'])
      await page.click('#credits summary')
      expect(await call('openSections')).toEqual(['credits'])
      await call('settled') // `toggle` on <details> is queued as a task
      expect(await call('sessionValue', 'accordion:faq')).toBe('["credits"]')
      await call('setup', faq())
      expect(await call('openSections')).toEqual(['credits'])
      expect(
        ((await call('events')) as string[]).filter((e) =>
          e.startsWith('accordion'),
        ),
      ).toEqual([
        // the platform opens the clicked one, then closes its named sibling
        'accordion:toggle controls=true',
        'accordion:toggle credits=true',
        'accordion:toggle controls=false',
        'accordion:toggle credits=true', // restored by the second setup
      ])
    })

    test('accordion: without remember nothing is stored; remember needs an id', async () => {
      await page.evaluate(() => sessionStorage.clear())
      await call('setup', faq(''))
      await page.click('#controls summary')
      await call('settled')
      expect(await call('sessionValue', 'accordion:faq')).toBe(null)
      expect(
        await call(
          'setupError',
          '<div data-panel="accordion" data-accordion-remember></div>',
        ),
      ).toContain('needs an id')
    })

    test('switch: role=switch only where the platform lacks the attribute', async () => {
      const markup =
        '<label><input id="subs" type="checkbox" switch data-panel="switch"> Subtitles</label>'
      await call('setup', markup)
      const native = await call('nativeSwitch')
      expect(await call('attributes', '#subs', ['role'])).toEqual({
        role: native ? null : 'switch',
      })
      await call('withoutSwitch', markup)
      expect(await call('attributes', '#subs', ['role'])).toEqual({
        role: 'switch',
      })
      await page.click('#subs')
      expect(
        await page.evaluate(
          () => (document.querySelector('#subs') as HTMLInputElement).checked,
        ),
      ).toBe(true)
      await call('setupAndEnd', markup)
      expect(await call('attributes', '#subs', ['role'])).toEqual({
        role: null,
      })
      expect(
        await call('setupError', '<button data-panel="switch">x</button>'),
      ).toContain('<button>')
    })

    test('alert dialog: the standard role switches on a description from the first paragraph', async () => {
      await call(
        'setup',
        `<dialog id="erase" data-panel="dialog" role="alertdialog"><h2>Erase the save?</h2><p>It cannot be undone.</p></dialog>
         <dialog id="plain" data-panel="dialog"><h2>Info</h2><p>Just text.</p></dialog>
         <dialog id="own" data-panel="dialog" role="alertdialog" aria-describedby="mine"><h2>Sure?</h2><p>no</p><p id="mine">yes</p></dialog>`,
      )
      expect(
        await call('attributes', '#erase', [
          'aria-labelledby',
          'aria-describedby',
        ]),
      ).toEqual({
        'aria-labelledby': 'erase-title',
        'aria-describedby': 'erase-message',
      })
      expect(await call('attributes', '#erase p', ['id'])).toEqual({
        id: 'erase-message',
      })
      expect(await call('attributes', '#plain', ['aria-describedby'])).toEqual({
        'aria-describedby': null,
      })
      expect(await call('attributes', '#own', ['aria-describedby'])).toEqual({
        'aria-describedby': 'mine',
      })
    })
  })
}

for (const [name, engine] of engines) {
  describe(`grid and treegrid in ${name}`, () => {
    let browser: Browser
    let page: Page
    const call = (fn: string, ...args: unknown[]) =>
      page.evaluate(
        ([f, a]) => (window as any).library[f as string](...(a as unknown[])),
        [fn, args] as const,
      )
    const focus = () => call('gridFocus')
    const games = `
      <table data-panel="grid" aria-label="Games" data-grid-page="2">
        <thead><tr><th>Title</th><th>Year</th><th>Actions</th></tr></thead>
        <tbody>
          <tr><td>Ys</td><td>1987</td><td><button>Play</button></td></tr>
          <tr><td>Sorcerian</td><td>1987</td><td><button>Play</button> <button>Info</button></td></tr>
          <tr><td>Xanadu</td><td>1985</td><td><a href="#x">Page</a></td></tr>
          <tr><td>Dragon Slayer</td><td>1984</td><td>—</td></tr>
        </tbody>
      </table>`
    const series = `
      <table data-panel="grid" aria-label="Series">
        <thead><tr><th>Title</th><th>Year</th></tr></thead>
        <tbody>
          <tr id="ys" aria-level="1"><td>Ys</td><td>1987</td></tr>
          <tr id="ys2" aria-level="2"><td>Ys II</td><td>1988</td></tr>
          <tr id="ys3" aria-level="2" aria-expanded="true"><td>Ys III</td><td>1989</td></tr>
          <tr id="ys3b" aria-level="3"><td>Ys III (PCE)</td><td>1991</td></tr>
          <tr id="xanadu" aria-level="1"><td>Xanadu</td><td>1985</td></tr>
        </tbody>
      </table>`

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

    test('grid: roles, one tab stop, arrows stop at the edges, Home/End, Ctrl+Home/End, Page keys', async () => {
      await call('setup', games)
      expect(await call('rolesOf', 'table, thead th')).toEqual([
        'grid',
        'columnheader',
        'columnheader',
        'columnheader',
      ])
      expect(await call('rolesOf', 'tbody tr')).toEqual(Array(4).fill('row'))
      expect(await call('rolesOf', 'tbody td')).toEqual(
        Array(12).fill('gridcell'),
      )
      expect(await call('tabStops')).toEqual(['Title'])
      await page.keyboard.press('Tab')
      expect(await focus()).toBe('0:0')
      await page.keyboard.press('ArrowUp')
      expect(await focus()).toBe('0:0')
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('ArrowRight')
      expect(await focus()).toBe('1:1')
      await page.keyboard.press('End')
      expect(await focus()).toBe('1:2 Play')
      await page.keyboard.press('ArrowRight')
      expect(await focus()).toBe('1:2 Play')
      await page.keyboard.press('Home')
      await page.keyboard.press('PageDown')
      expect(await focus()).toBe('3:0')
      await page.keyboard.press('ControlOrMeta+End')
      expect(await focus()).toBe('4:2')
      await page.keyboard.press('ControlOrMeta+Home')
      expect(await focus()).toBe('0:0')
      expect(await call('tabStops')).toEqual(['Title'])
    })

    test('grid: a cell with one widget focuses it; several need Enter, then Tab among them, Escape back', async () => {
      await call('setup', games)
      await page.focus('tbody tr:nth-child(3) td:nth-child(3) a')
      expect(await focus()).toBe('3:2 Page')
      await page.keyboard.press('ArrowUp')
      expect(await focus()).toBe('2:2')
      await page.keyboard.press('Enter')
      expect(await focus()).toBe('2:2 Play')
      await page.keyboard.press('Tab')
      expect(await focus()).toBe('2:2 Info')
      await page.keyboard.press('ArrowLeft')
      expect(await focus()).toBe('2:2 Info')
      await page.keyboard.press('Escape')
      expect(await focus()).toBe('2:2')
      await page.keyboard.press('ArrowLeft')
      expect(await focus()).toBe('2:1')
    })

    test('treegrid: parent rows expand and collapse with → and ←, children hide, ← in the first cell goes to the row', async () => {
      await call('record')
      await call('setup', series)
      expect(await call('rolesOf', 'table')).toEqual(['treegrid'])
      expect(await call('attributes', '#ys', ['aria-expanded'])).toEqual({
        'aria-expanded': 'false',
      })
      expect(await call('attributes', '#ys2', ['aria-expanded'])).toEqual({
        'aria-expanded': null,
      })
      expect(await call('visibleRows')).toEqual(['ys', 'xanadu'])
      await page.focus('#ys')
      await page.keyboard.press('ArrowRight')
      expect(await call('visibleRows')).toEqual([
        'ys',
        'ys2',
        'ys3',
        'ys3b',
        'xanadu',
      ])
      await page.keyboard.press('ArrowRight')
      expect(await focus()).toBe('1:0')
      await page.keyboard.press('ArrowLeft')
      expect(await focus()).toBe('row 1')
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('ArrowLeft')
      expect(await call('visibleRows')).toEqual(['ys', 'ys2', 'ys3', 'xanadu'])
      await page.keyboard.press('Home')
      await page.keyboard.press('ArrowLeft')
      expect(await call('visibleRows')).toEqual(['ys', 'xanadu'])
      await page.keyboard.press('ArrowRight')
      expect(await call('visibleRows')).toEqual(['ys', 'ys2', 'ys3', 'xanadu'])
      expect(
        ((await call('events')) as string[]).filter((e) =>
          e.startsWith('grid'),
        ),
      ).toEqual([
        'grid:toggle ys=true',
        'grid:toggle ys3=false',
        'grid:toggle ys=false',
        'grid:toggle ys=true',
      ])
    })

    test('ended: the table as the server sent it, every row shown', async () => {
      await call('setupAndEnd', series)
      expect(await call('attributes', 'table', ['role'])).toEqual({
        role: null,
      })
      expect(
        await call('attributes', '#ys', ['role', 'tabindex', 'aria-expanded']),
      ).toEqual({ role: null, tabindex: null, 'aria-expanded': null })
      expect(await call('visibleRows')).toEqual([
        'ys',
        'ys2',
        'ys3',
        'ys3b',
        'xanadu',
      ])
      expect(
        await call('setupError', '<div data-panel="grid"></div>'),
      ).toContain('<div>')
    })
  })
}

for (const [name, engine] of engines) {
  describe(`tree in ${name}`, () => {
    let browser: Browser
    let page: Page
    const call = (fn: string, ...args: unknown[]) =>
      page.evaluate(
        ([f, a]) => (window as any).library[f as string](...(a as unknown[])),
        [fn, args] as const,
      )
    const focus = () => call('treeFocus')
    const contents = `
      <ul id="toc" data-panel="tree" aria-label="Contents">
        <li id="p1">Part I
          <ul>
            <li id="c1"><a id="l1" href="#c1">Chapter 1</a></li>
            <li id="c2" aria-expanded="true">Chapter 2
              <ul><li id="s1">Section 1</li></ul>
            </li>
          </ul>
        </li>
        <li id="p2">Part II<ul><li id="c3">Chapter 3</li></ul></li>
        <li id="ap">Appendix</li>
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

    test('roles as APG: items, a link as the item, groups; parents closed unless said open', async () => {
      await call('setup', contents)
      expect(await call('rolesOf', '#toc')).toEqual(['tree'])
      expect(await call('rolesOf', '#toc ul')).toEqual(Array(3).fill('group'))
      expect(await call('rolesOf', '#p1, #l1, #ap')).toEqual(
        Array(3).fill('treeitem'),
      )
      expect(await call('rolesOf', '#c1')).toEqual(['none'])
      expect(
        await call('attributes', '#p1', ['aria-expanded', 'tabindex']),
      ).toEqual({ 'aria-expanded': 'false', tabindex: '0' })
      expect(
        await call('attributes', '#ap', ['aria-expanded', 'tabindex']),
      ).toEqual({ 'aria-expanded': null, tabindex: '-1' })
      expect(await call('visibleItems')).toEqual(['p1', 'p2', 'ap'])
    })

    test('keys: → opens then enters, ← closes then goes up, ↑ ↓ Home End, *, typeahead', async () => {
      await call('record')
      await call('setup', contents)
      await page.keyboard.press('Tab')
      expect(await focus()).toBe('li Part I')
      await page.keyboard.press('ArrowRight')
      expect(await call('visibleItems')).toEqual([
        'p1',
        'l1',
        'c2',
        's1',
        'p2',
        'ap',
      ])
      await page.keyboard.press('ArrowRight')
      expect(await focus()).toBe('a Chapter 1')
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('ArrowLeft')
      expect(await call('visibleItems')).toEqual(['p1', 'l1', 'c2', 'p2', 'ap'])
      await page.keyboard.press('ArrowLeft')
      expect(await focus()).toBe('li Part I')
      await page.keyboard.press('End')
      expect(await focus()).toBe('li Appendix')
      await page.keyboard.press('Home')
      await page.keyboard.press('*')
      expect(await call('visibleItems')).toEqual([
        'p1',
        'l1',
        'c2',
        'p2',
        'c3',
        'ap',
      ])
      await page.keyboard.press('a')
      expect(await focus()).toBe('li Appendix')
      await page.keyboard.press('ArrowUp')
      expect(await focus()).toBe('li Chapter 3')
      expect(
        ((await call('events')) as string[]).filter((e) =>
          e.startsWith('tree'),
        ),
      ).toEqual([
        'tree:toggle p1=true',
        'tree:toggle c2=false',
        'tree:toggle p2=true',
      ])
    })

    test("selection: Enter or a click selects one item; a click on a parent's text toggles it", async () => {
      await call('record')
      await call('setup', contents)
      await page.focus('#ap')
      await page.keyboard.press('Enter')
      expect(await call('attributes', '#ap', ['aria-selected'])).toEqual({
        'aria-selected': 'true',
      })
      await page.click('#p2')
      expect(await call('visibleItems')).toEqual(['p1', 'p2', 'c3', 'ap'])
      await page.click('#c3')
      expect(await call('attributes', '#ap', ['aria-selected'])).toEqual({
        'aria-selected': 'false',
      })
      expect(
        ((await call('events')) as string[]).filter((e) =>
          e.startsWith('tree'),
        ),
      ).toEqual([
        'tree:select Appendix',
        'tree:toggle p2=true',
        'tree:select Chapter 3',
      ])
    })

    test('ended: the outline as the server sent it', async () => {
      await call('setupAndEnd', contents)
      expect(await call('rolesOf', '#toc, #p1, #l1, #c1')).toEqual([
        null,
        null,
        null,
        null,
      ])
      expect(
        await page.evaluate(
          () => document.querySelectorAll('[hidden], [tabindex]').length,
        ),
      ).toBe(0)
    })
  })
}

for (const [name, engine] of engines) {
  describe(`carousel and splitter in ${name}`, () => {
    let browser: Browser
    let page: Page
    const call = (fn: string, ...args: unknown[]) =>
      page.evaluate(
        ([f, a]) => (window as any).library[f as string](...(a as unknown[])),
        [fn, args] as const,
      )
    const screens = (attrs = '') => `
      <style>
        #shots { display: flex; overflow-x: auto; scroll-snap-type: x mandatory; width: 300px; margin: 0; padding: 0; list-style: none }
        #shots > li { flex: 0 0 300px; height: 100px; scroll-snap-align: start }
      </style>
      <section id="c" data-panel="carousel" aria-label="Screens" ${attrs} style="width:300px">
        <button data-carousel-toggle>⏯</button>
        <button id="prev" data-carousel-prev aria-label="Previous">‹</button>
        <ul id="shots" data-carousel-slides><li>A</li><li aria-label="Title screen">B</li><li>C</li></ul>
        <button id="next" data-carousel-next aria-label="Next">›</button>
      </section>`
    const shell = (attrs = '') => `
      <div id="shell" style="display:flex;width:600px;height:200px">
        <nav id="side" style="inline-size:var(--splitter-size, 200px);flex:none">side</nav>
        <div id="sep" data-panel="splitter" aria-controls="side" aria-label="Sidebar width" ${attrs} style="width:8px;flex:none;background:#999"></div>
        <main style="flex:1">main</main>
      </div>`

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
      await page.emulateMedia({ reducedMotion: 'reduce' })
    })

    test('carousel: APG names, next/prev move the scroller, the current slide follows; no toggle without rotation', async () => {
      await call('record')
      await call('setup', screens())
      expect(
        await call('attributes', '#c', ['role', 'aria-roledescription']),
      ).toEqual({ role: 'region', 'aria-roledescription': 'carousel' })
      expect(
        await call('attributes', '#shots > li', [
          'role',
          'aria-roledescription',
        ]),
      ).toEqual({ role: 'group', 'aria-roledescription': 'slide' })
      expect(await call('carouselState')).toMatchObject({
        current: 0,
        labels: ['1 of 3', 'Title screen', '3 of 3'],
        live: null,
      })
      expect(
        await call('attributes', '[data-carousel-toggle]', ['hidden']),
      ).toEqual({ hidden: '' })
      await page.click('#next')
      await call('settled')
      expect(await call('carouselState')).toMatchObject({
        current: 1,
        scrollLeft: 300,
      })
      await page.click('#prev')
      await call('settled')
      await page.click('#prev')
      await call('settled')
      expect(await call('carouselState')).toMatchObject({ current: 2 })
      expect(
        ((await call('events')) as string[]).filter((e) =>
          e.startsWith('carousel'),
        ),
      ).toEqual([
        'carousel:change 0',
        'carousel:change 1',
        'carousel:change 0',
        'carousel:change 2',
      ])
    })

    test('carousel: rotation advances, pauses under the pointer, the toggle stops it for good', async () => {
      await page.mouse.move(700, 500)
      await call('setup', screens('data-carousel-interval="150"'))
      expect(await call('carouselState')).toMatchObject({
        toggle: 'Stop slide rotation',
        live: 'off',
      })
      await page.waitForTimeout(220)
      expect(await call('carouselState')).toMatchObject({ current: 1 })
      await page.mouse.move(150, 60)
      await page.waitForTimeout(350)
      expect(await call('carouselState')).toMatchObject({ current: 1 })
      await page.mouse.move(700, 500)
      await page.waitForTimeout(220)
      expect(await call('carouselState')).toMatchObject({ current: 2 })
      await page.click('[data-carousel-toggle]')
      const stopped = (await call('carouselState')) as { current: number }
      await page.mouse.move(700, 500)
      await page.waitForTimeout(350)
      expect(await call('carouselState')).toMatchObject({
        current: stopped.current, // a tick may have landed before the click; none after it
        toggle: 'Start slide rotation',
        live: 'polite',
      })
    })

    test('splitter: separator with a value; arrows, Shift, Home/End, Enter collapses and restores', async () => {
      await call('record')
      await call('setup', shell('data-splitter-min="50"'))
      expect(await call('splitterState')).toEqual({
        role: 'separator',
        now: '33',
        size: '',
        width: 200,
        collapsed: false,
      })
      await page.focus('#sep')
      await page.keyboard.press('ArrowRight')
      expect(await call('splitterState')).toMatchObject({
        size: '210px',
        width: 210,
        now: '35',
      })
      await page.keyboard.press('Shift+ArrowLeft')
      expect(await call('splitterState')).toMatchObject({
        size: '110px',
        width: 110,
      })
      await page.keyboard.press('Home')
      expect(await call('splitterState')).toMatchObject({
        size: '50px',
        now: '8',
      })
      await page.keyboard.press('End')
      expect(await call('splitterState')).toMatchObject({
        size: '600px',
        now: '100',
      })
      await page.keyboard.press('Enter') // collapses below min, then restores the 600
      expect(await call('splitterState')).toMatchObject({
        size: '0px',
        collapsed: true,
        now: '0',
      })
      await page.keyboard.press('Enter')
      expect(await call('splitterState')).toMatchObject({
        size: '600px',
        collapsed: false,
      })
      await call('setup', shell())
      await page.focus('#sep')
      await page.keyboard.press('Enter')
      expect(await call('splitterState')).toMatchObject({
        size: '0px',
        width: 0,
        collapsed: true,
        now: '0',
      })
      await page.keyboard.press('Enter')
      expect(await call('splitterState')).toMatchObject({
        size: '200px',
        collapsed: false,
      })
      expect(
        ((await call('events')) as string[])
          .filter((e) => e.startsWith('splitter'))
          .slice(0, 2),
      ).toEqual(['splitter:resize 210px 35%', 'splitter:resize 110px 18%'])
    })

    test('splitter: dragging resizes; ended, the panes keep their CSS', async () => {
      await call('setup', shell())
      await page.mouse.move(204, 100)
      await page.mouse.down()
      await page.mouse.move(304, 100, { steps: 4 })
      await page.mouse.up()
      expect(await call('splitterState')).toMatchObject({
        width: 304,
        size: '304px',
      })
      await call('setupAndEnd', shell())
      expect(await call('splitterState')).toEqual({
        role: null,
        now: null,
        size: '',
        width: 200,
        collapsed: false,
      })
      expect(
        await call(
          'setupError',
          '<div data-panel="splitter" aria-controls="nope"></div>',
        ),
      ).toContain('names no element')
    })
  })
}

/** Every panel's markup: connected and ended, layer 0 is back (the reviewers' group A). */
const LAYER_ZERO: [string, string][] = [
  [
    'focusgroup',
    '<div data-panel="focusgroup" focusgroup="toolbar"><button>a</button><button>b</button></div>',
  ],
  [
    'tabs',
    '<div data-panel="tabs"><ul><li><a href="#s1">One</a></li><li><a href="#s2">Two</a></li></ul><section id="s1">1</section><section id="s2" hidden>2</section></div>',
  ],
  [
    'dialog',
    '<dialog id="d" data-panel="dialog" role="alertdialog"><h2>Title</h2><p>Message</p></dialog>',
  ],
  [
    'feed',
    '<section data-panel="feed"><article><h3>A</h3></article><article><h3>B</h3></article></section>',
  ],
  ['press-hold', '<li data-panel="press-hold">x</li>'],
  ['confirm-on-hold', '<button data-panel="confirm-on-hold">Delete</button>'],
  [
    'gesture',
    '<div data-panel="gesture" data-gesture-axis="x" style="width:10px"></div>',
  ],
  [
    'slider',
    '<div data-panel="slider" data-slider-valuetext="{value} %"><input type="range" value="20"><input type="range" value="80"></div>',
  ],
  ['hover-intent', '<div data-panel="hover-intent"></div>'],
  [
    'keymap',
    '<div data-panel="keymap" data-keymap-keys=\'{"j":"next"}\'></div>',
  ],
  [
    'indicator',
    '<div data-panel="indicator" style="--own: 1"><button aria-selected="true">a</button></div>',
  ],
  [
    'tokens',
    '<div data-panel="tokens" data-tokens-values=\'{"accent":"blue"}\' style="--accent: red"></div>',
  ],
  ['activity', '<div data-panel="activity"></div>'],
  [
    'typewriter',
    '<p data-panel="typewriter">Read <a href="#x">this</a> now</p>',
  ],
  ['decode', '<p data-panel="decode">Hello <em>there</em></p>'],
  ['sequence', '<div data-panel="sequence"></div>'],
  [
    'listbox',
    '<ul data-panel="listbox" aria-label="l"><li>a</li><li>b</li></ul>',
  ],
  [
    'combobox (input)',
    '<input data-panel="combobox" aria-controls="cl" aria-label="c"><ul id="cl" hidden><li>a</li></ul>',
  ],
  [
    'combobox (select)',
    '<label for="cs">Platform</label><select id="cs" data-panel="combobox"><option value="a">A</option></select>',
  ],
  [
    'menu',
    '<button commandfor="m" command="toggle-popover">More</button><div id="m" data-panel="menu" popover><button>One</button><hr><button role="menuitemcheckbox">Two</button></div>',
  ],
  [
    'tooltip',
    '<button interestfor="tip">i</button><div id="tip" popover="hint" data-panel="tooltip">Text <a href="#r">rich</a></div>',
  ],
  ['toast', '<div data-panel="toast" aria-label="Notices"><p>Saved</p></div>'],
  [
    'accordion',
    '<div id="acc" data-panel="accordion"><details name="f"><summary>a</summary>1</details></div>',
  ],
  ['switch', '<input type="checkbox" switch data-panel="switch">'],
  [
    'grid',
    '<table data-panel="grid"><thead><tr><th>T</th></tr></thead><tbody><tr aria-level="1"><td><a href="#g">a</a></td></tr><tr aria-level="2"><td>b</td></tr></tbody></table>',
  ],
  [
    'tree',
    '<ul data-panel="tree" aria-label="t"><li>Part<ul><li><a href="#c">Ch</a></li></ul></li></ul>',
  ],
  [
    'carousel',
    '<section data-panel="carousel" aria-label="s" data-carousel-interval="60000"><button data-carousel-toggle aria-label="Pause">⏯</button><ul data-carousel-slides><li>a</li><li aria-label="B" data-current>b</li></ul></section>',
  ],
  [
    'splitter',
    '<div style="display:flex"><nav id="sp">s</nav><div data-panel="splitter" aria-controls="sp"></div><main>m</main></div>',
  ],
]

for (const [name, engine] of engines) {
  describe(`layer 0 comes back in ${name}`, () => {
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

    for (const [panelName, html] of LAYER_ZERO)
      test(`${panelName}: what the server sent, after the panel ends`, async () => {
        const result = (await call('roundTrip', html)) as {
          same: boolean
          before: string
          after: string
        }
        expect(result.after).toBe(result.before)
      })
  })
}

for (const [name, engine] of engines) {
  describe(`review fixes, batches 1–2 in ${name}`, () => {
    let browser: Browser
    let page: Page
    const call = (fn: string, ...args: unknown[]) =>
      page.evaluate(
        ([f, a]) => (window as any).library[f as string](...(a as unknown[])),
        [fn, args] as const,
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

    test('gesture: a button inside still gets its click; a second pointer is ignored', async () => {
      await call('record')
      await call(
        'setup',
        '<div data-panel="gesture" style="position:fixed;left:0;top:0;width:300px;height:200px"><button id="inner" style="position:absolute;left:10px;top:10px;width:80px;height:40px">go</button></div>',
      )
      await call('clicksInside', '#inner')
      await page.mouse.click(50, 30)
      expect(await call('wasClicked')).toBe(true)
      expect(
        ((await call('events')) as string[]).filter((e) =>
          e.startsWith('gesture'),
        ),
      ).toEqual(['gesture:tap'])
    })

    test('press-hold: letting go outside cancels (WCAG 2.5.2); confirm-on-hold never fires after the panel ended', async () => {
      await call('record')
      await call(
        'setup',
        `<div id="item" data-panel="press-hold" data-press-hold-duration="150" style="position:fixed;left:0;top:0;width:200px;height:100px"></div>
         <button id="del" data-panel="confirm-on-hold" data-confirm-on-hold-duration="150" style="position:fixed;left:0;top:300px;width:200px;height:50px">Delete</button>`,
      )
      await page.mouse.move(50, 50)
      await page.mouse.down()
      await page.mouse.move(500, 500, { steps: 2 })
      await page.mouse.up()
      await page.waitForTimeout(250)
      expect(
        ((await call('events')) as string[]).filter((e) =>
          e.startsWith('press'),
        ),
      ).toEqual([])
      await page.mouse.move(50, 320)
      await page.mouse.down()
      await call('endPanels')
      await page.waitForTimeout(250)
      await page.mouse.up()
      expect(
        ((await call('events')) as string[]).filter((e) =>
          e.startsWith('confirm'),
        ),
      ).toEqual([])
    })

    test('focusgroup: a nested group keeps its keys; arrows inside a text field move the caret', async () => {
      await call(
        'setup',
        `<div data-panel="focusgroup" focusgroup="toolbar inline">
          <button id="a">a</button>
          <span data-panel="focusgroup" focusgroup="toolbar inline"><button id="c">c</button><button id="d">d</button></span>
          <input id="field" value="text">
        </div>`,
      )
      await page.focus('#c')
      await page.keyboard.press('ArrowRight')
      expect(await page.evaluate(() => document.activeElement?.id)).toBe('d')
      await page.focus('#field')
      await page.keyboard.press('ArrowLeft')
      expect(await page.evaluate(() => document.activeElement?.id)).toBe(
        'field',
      )
    })

    test('tabs: the selected tab is the tab stop, so Tab does not change the selection', async () => {
      await call(
        'setup',
        `<button id="before">b</button><div data-panel="tabs"><ul><li><a href="#one">One</a></li><li><a id="two" href="#two" aria-selected="true">Two</a></li></ul><section id="one">1</section><section id="two">2</section></div>`,
      )
      await page.focus('#before')
      await page.keyboard.press('Tab')
      expect(await page.evaluate(() => document.activeElement?.id)).toBe('two')
      expect(await call('tabsState')).toMatchObject({ shown: ['two'] })
    })

    test('tabs: links inside the sections are content, not tabs', async () => {
      await call(
        'setup',
        `<div data-panel="tabs"><ul><li><a href="#one">One</a></li><li><a href="#two">Two</a></li></ul>
          <section id="one">1 <a href="#top">Back to top</a></section><section id="two">2</section></div>`,
      )
      expect(await call('rolesOf', 'a')).toEqual(['tab', 'tab', null])
      expect(await call('tabsState')).toMatchObject({ shown: ['one'] })
    })

    test('keymap: ctrl+shift+k and ctrl+k are different bindings', async () => {
      await call('record')
      await call(
        'setup',
        `<div data-panel="keymap" data-keymap-keys='{"ctrl+shift+k":"A","ctrl+k":"B"}'><button id="b">b</button></div>`,
      )
      await page.focus('#b')
      await page.keyboard.press('Control+Shift+K')
      await page.keyboard.press('Control+k')
      expect(
        ((await call('events')) as string[]).filter((e) =>
          e.startsWith('keymap'),
        ),
      ).toEqual(['keymap:action A', 'keymap:action B'])
    })

    test('slider: the end thumbs keep the native bounds; a number input inside is left alone', async () => {
      await call(
        'setup',
        '<div data-panel="slider"><input id="t1" type="range" value="20"><input id="t2" type="range" value="80"><input id="n" type="number" value="99"></div>',
      )
      expect(
        await call('attributes', '#t1', ['aria-valuemin', 'aria-valuemax']),
      ).toEqual({ 'aria-valuemin': null, 'aria-valuemax': '80' })
      expect(
        await call('attributes', '#t2', ['aria-valuemin', 'aria-valuemax']),
      ).toEqual({ 'aria-valuemin': '20', 'aria-valuemax': null })
      await page.focus('#n')
      await page.keyboard.press('ControlOrMeta+a')
      await page.keyboard.type('99')
      expect(
        await page.evaluate(
          () => (document.querySelector('#n') as HTMLInputElement).value,
        ),
      ).toBe('99') // kept, not clamped to a thumb
    })

    test('typewriter: inline markup survives; characters are whole graphemes', async () => {
      await call(
        'setup',
        '<p id="p" data-panel="typewriter" data-typewriter-interval="20">🎮 <a href="#x">Ys</a></p>',
      )
      await page.waitForTimeout(30)
      const during = (await call('texts', '#p')) as { shown: string }
      expect(during.shown).not.toContain('\uFFFD')
      await page.waitForTimeout(200)
      expect(
        await page.evaluate(() => document.querySelector('#p')!.innerHTML),
      ).toBe('🎮 <a href="#x">Ys</a>')
    })

    test('dialog: closedby="any" bridge ignores a press that started inside and ended on the backdrop', async () => {
      await call(
        'withoutPlatform',
        '<dialog id="d" data-panel="dialog" closedby="any" style="width:200px;height:100px;margin:0;position:fixed;left:100px;top:100px"><p>Select me</p></dialog>',
        ['closedBy'],
      )
      await call('openModal', 'd')
      await page.mouse.move(150, 150)
      await page.mouse.down()
      await page.mouse.move(600, 500, { steps: 3 })
      await page.mouse.up()
      expect(
        await page.evaluate(
          () => (document.querySelector('#d') as HTMLDialogElement).open,
        ),
      ).toBe(true)
      await page.mouse.click(600, 500)
      expect(
        await page.evaluate(
          () => (document.querySelector('#d') as HTMLDialogElement).open,
        ),
      ).toBe(false)
    })

    test('hover-intent: crossing a child does not count as leaving', async () => {
      await call('record')
      await call(
        'setup',
        '<div data-panel="hover-intent" data-hover-intent-start="50" data-hover-intent-end="50" style="position:fixed;left:0;top:0;width:300px;height:200px;padding:40px"><span style="display:block;width:100%;height:100%;background:#ccc"></span></div>',
      )
      await page.mouse.move(700, 500)
      await page.mouse.move(20, 20)
      await page.waitForTimeout(120)
      await page.mouse.move(150, 100)
      await page.mouse.move(20, 20)
      await page.waitForTimeout(120)
      expect(
        ((await call('events')) as string[]).filter((e) =>
          e.startsWith('hover'),
        ),
      ).toEqual(['hover-intent:enter'])
    })
  })
}

for (const [name, engine] of engines) {
  describe(`review fixes, batch 3 in ${name}`, () => {
    let browser: Browser
    let page: Page
    const call = (fn: string, ...args: unknown[]) =>
      page.evaluate(
        ([f, a]) => (window as any).library[f as string](...(a as unknown[])),
        [fn, args] as const,
      )
    const press = async (key: string) => {
      await page.keyboard.press(key)
      await call('settled')
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

    test('grid: a select in a cell keeps its arrows; editing ends when focus leaves; Enter on a link follows it', async () => {
      await call(
        'setup',
        `<table data-panel="grid" aria-label="g"><tbody>
          <tr aria-level="1"><td><a id="lnk" href="#frag">a</a></td><td><select id="sel"><option>a</option><option>b</option></select></td></tr>
          <tr aria-level="2"><td>child</td><td><a id="l1" href="#1">1</a> <a id="l2" href="#2">2</a></td></tr>
          <tr aria-level="1"><td id="plain">p</td><td>q</td></tr>
        </tbody></table>`,
      )
      await page.evaluate(() =>
        (document.querySelector('#sel') as HTMLElement).closest('td')!.focus(),
      )
      expect(await call('gridFocus')).toBe('0:1')
      await page.keyboard.press('Enter')
      expect(await call('focusedId')).toBe('sel')
      await page.keyboard.press('Escape')
      expect(await call('gridFocus')).toBe('0:1')
      await page.evaluate(() =>
        (document.querySelector('#plain') as HTMLElement).focus(),
      )
      await page.keyboard.press('ArrowUp')
      expect(await call('gridFocus')).toBe('0:0 a') // the grid's keys work again (editing ended on blur); the closed child row is skipped
      expect(await call('attributes', '#l1', ['tabindex'])).toEqual({
        tabindex: '-1',
      })
      await page.focus('#lnk')
      await page.keyboard.press('Enter')
      await call('settled')
      expect(await page.evaluate(() => location.hash)).toBe('#frag')
      expect(await call('attributes', 'tbody tr', ['aria-expanded'])).toEqual({
        'aria-expanded': 'false',
      })
    })

    test('combobox: one change per real change; reopening shows every option; the select stays the source', async () => {
      await call('record')
      await call(
        'setup',
        `<form><select id="plat" data-panel="combobox"><option value="snes">SNES</option><option value="md">Mega Drive</option></select><button id="away" type="button">away</button></form>`,
      )
      await page.click('[role=combobox]', { clickCount: 3 })
      await page.keyboard.type('mega')
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('Enter')
      await page.focus('#away')
      await page.focus('[role=combobox]')
      await page.focus('#away')
      expect(
        ((await call('events')) as string[]).filter((e) =>
          e.startsWith('combobox'),
        ),
      ).toEqual(['combobox:change Mega Drive'])
      await page.focus('[role=combobox]')
      await page.keyboard.press('ArrowDown')
      expect(await call('hiddenFlags', '[role=option]')).toEqual([false, false])
      await page.keyboard.press('Escape')
      await call('setSelect', '#plat', 'snes')
      expect(await call('comboState')).toMatchObject({ value: 'SNES' })
      await page.evaluate(() =>
        (document.querySelector('form') as HTMLFormElement).reset(),
      )
      await call('settled')
      expect(await call('comboState')).toMatchObject({ value: 'SNES' })
      await page.evaluate(() =>
        document
          .querySelector('#plat')!
          .insertAdjacentHTML(
            'beforeend',
            '<option value="pce">PC Engine</option>',
          ),
      )
      await call('settled')
      expect(await call('rolesOf', '[role=option]')).toHaveLength(3)
    })

    test('toast: the region of the modal on top, even when it comes first in the DOM', async () => {
      await call(
        'setup',
        `<div id="page" data-panel="toast" aria-label="n"></div>
         <dialog id="b"><button id="bb">b</button><div id="rb" data-panel="toast" aria-label="n"></div></dialog>
         <dialog id="a"><button id="ab">open b</button><div id="ra" data-panel="toast" aria-label="n"></div></dialog>`,
      )
      await call('openModal', 'a')
      expect(await call('regionInUse')).toBe('ra')
      await call('openModal', 'b')
      expect(await call('regionInUse')).toBe('rb')
    })

    test('listbox: Shift+arrow at the edge changes nothing; options added later join in', async () => {
      await call('record')
      await call(
        'setup',
        '<ul id="lb" data-panel="listbox" data-listbox-multiple aria-label="l"><li>a</li><li>b</li></ul>',
      )
      await page.focus('#lb')
      await page.keyboard.press('End')
      await page.keyboard.press('Space')
      await page.keyboard.press('Shift+ArrowDown')
      await page.keyboard.press('Shift+ArrowDown')
      expect((await call('listboxState')).selected).toEqual(['b'])
      await call('appendOption', '#lb', 'c')
      await call('settled')
      await page.keyboard.press('ArrowDown')
      expect(await call('listboxState')).toMatchObject({ active: 'c' })
    })

    test('tooltip: a native dismissal is a loss of interest too; a tooltip nobody points at is an error', async () => {
      await call('record')
      await call(
        'setup',
        `<button id="info" interestfor="tip" style="position:fixed;left:0;top:0;width:60px;height:30px">i</button>
         <div id="tip" popover="hint" data-panel="tooltip" style="position:fixed;inset:auto;left:300px;top:300px;margin:0">Rich <a href="#r">more</a></div>`,
      )
      await page.focus('#info')
      await page.waitForTimeout(800)
      expect(await call('tipState')).toMatchObject({ open: true })
      await page.evaluate(() =>
        (document.querySelector('#tip') as HTMLElement).hidePopover(),
      )
      await call('settled')
      expect(await call('tipState')).toMatchObject({
        open: false,
        expanded: (await call('nativeInterest')) ? null : 'false',
      })
      if (!(await call('nativeInterest')))
        expect(await call('events')).toEqual(['interest', 'loseinterest'])
      expect(
        await call(
          'setupError',
          '<div popover="hint" data-panel="tooltip">lonely</div>',
        ),
      ).toContain('no <button interestfor')
    })

    test('menu: two invokers both say they open it; focus returns to the one that did', async () => {
      await call(
        'setup',
        `<button id="t1" commandfor="acts" command="toggle-popover">one</button>
         <button id="t2" commandfor="acts" command="toggle-popover">two</button>
         <div id="acts" data-panel="menu" popover><button>Favorite</button></div>`,
      )
      expect(
        await call('attributes', '#t2', ['aria-haspopup', 'aria-expanded']),
      ).toEqual({ 'aria-haspopup': 'menu', 'aria-expanded': 'false' })
      await page.click('#t2')
      await call('settled')
      expect(await call('attributes', '#t1', ['aria-expanded'])).toEqual({
        'aria-expanded': 'true',
      })
      await press('Escape')
      expect(await call('focusedId')).toBe('t2')
    })

    test('carousel: a scroller that is not at the page edge still knows its current slide', async () => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await call(
        'setup',
        `<style>#sh { display:flex; overflow-x:auto; scroll-snap-type:x mandatory; width:300px; margin:0; padding:0; list-style:none } #sh > li { flex:0 0 300px; height:60px; scroll-snap-align:start }</style>
         <section data-panel="carousel" aria-label="s" style="display:flex;margin-left:200px">
           <button id="prev" data-carousel-prev aria-label="p" style="width:180px">‹</button>
           <ul id="sh" data-carousel-slides><li>A</li><li>B</li><li>C</li></ul>
           <button id="next" data-carousel-next aria-label="n">›</button>
         </section>`,
      )
      await page.click('#next')
      await call('settled')
      expect(await call('carouselState')).toMatchObject({
        current: 1,
        scrollLeft: 300,
      })
      await page.click('#next')
      await call('settled')
      expect(await call('carouselState')).toMatchObject({
        current: 2,
        scrollLeft: 600,
      })
    })
  })
}

for (const [name, engine] of engines) {
  describe(`review round 4, panels in ${name}`, () => {
    let browser: Browser
    let page: Page
    const call = (fn: string, ...args: unknown[]) =>
      page.evaluate(
        ([f, a]) => (window as any).library[f as string](...(a as unknown[])),
        [fn, args] as const,
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

    test("two panels on one element: the server's markup comes back whatever the order", async () => {
      for (const html of [
        '<div data-panel="tokens gesture" data-tokens-values=\'{"accent":"blue"}\' data-gesture-axis="x"></div>',
        '<div data-panel="gesture tokens" data-tokens-values=\'{"accent":"blue"}\' data-gesture-axis="x" style="color: red"></div>',
        '<div data-panel="focusgroup indicator" focusgroup="toolbar"><button aria-selected="true">a</button></div>',
      ]) {
        const result = (await call('roundTrip', html)) as {
          before: string
          after: string
        }
        expect(result.after).toBe(result.before)
      }
    })

    test('attach with a signal already aborted connects nothing', async () => {
      expect(
        await call(
          'attachAborted',
          '<ul data-panel="listbox" aria-label="l"><li>a</li></ul>',
        ),
      ).toEqual({ connected: false })
    })

    test('focusgroup skips hidden items; dialogs without ids get distinct ones', async () => {
      await call(
        'setup',
        `<div data-panel="focusgroup" focusgroup="toolbar inline"><button id="a">a</button><button id="b" hidden>b</button><button id="c">c</button></div>
         <dialog data-panel="dialog"><h2>One</h2></dialog><dialog data-panel="dialog"><h2>Two</h2></dialog>`,
      )
      await page.focus('#a')
      await page.keyboard.press('ArrowRight')
      expect(await call('focusedId')).toBe('c')
      const ids = await page.evaluate(() =>
        [...document.querySelectorAll('dialog h2')].map((h) => h.id),
      )
      expect(new Set(ids).size).toBe(2)
      expect(
        await page.evaluate(() =>
          [...document.querySelectorAll('dialog')].map((d) =>
            d.getAttribute('aria-labelledby'),
          ),
        ),
      ).toEqual(ids)
    })

    test('confirm-on-hold: a click without a pointer (assistive technology) arms, then confirms', async () => {
      await call('record')
      await call(
        'setup',
        '<button id="del" data-panel="confirm-on-hold">Delete</button>',
      )
      await call('syntheticClick', '#del')
      expect(await call('attributes', '#del', ['data-armed'])).toEqual({
        'data-armed': '',
      })
      await call('syntheticClick', '#del')
      expect(
        ((await call('events')) as string[]).filter((e) =>
          e.startsWith('confirm'),
        ),
      ).toEqual(['confirm-on-hold:confirm'])
    })

    test('toast refuses a list; carousel li slides make their list presentational', async () => {
      expect(
        await call('setupError', '<ol data-panel="toast" aria-label="n"></ol>'),
      ).toContain('not <ol>')
      await call(
        'setup',
        '<section data-panel="carousel" aria-label="s"><ul id="sl" data-carousel-slides><li>a</li><li>b</li></ul></section>',
      )
      expect(await call('rolesOf', '#sl, #sl > li')).toEqual([
        'presentation',
        'group',
        'group',
      ])
    })

    test('splitter leaves Alt/Ctrl/Meta arrows to the browser; listbox typeahead cycles on a repeated letter', async () => {
      await call(
        'setup',
        `<div style="display:flex;width:600px"><nav id="side" style="inline-size:var(--splitter-size, 200px);flex:none">s</nav><div id="sep" data-panel="splitter" aria-controls="side" style="width:8px;flex:none"></div><main style="flex:1">m</main></div>
         <ul id="lb" data-panel="listbox" aria-label="l"><li>Alpha</li><li>Avocado</li><li>Apple</li><li>Beta</li></ul>`,
      )
      await page.focus('#sep')
      await page.keyboard.press('Alt+ArrowRight')
      expect(await call('splitterState')).toMatchObject({ size: '' })
      await page.focus('#lb')
      await page.keyboard.press('a') // focus had made Alpha active: the next one starting with a
      expect(await call('listboxState')).toMatchObject({ active: 'Avocado' })
      await page.keyboard.press('a') // again: the one after, not the prefix "aa"
      expect(await call('listboxState')).toMatchObject({ active: 'Apple' })
    })

    test('requestCloseTop: a popover opened from inside a modal is above it', async () => {
      await call(
        'setup',
        `<div id="help" popover>help</div><dialog id="d"><button id="hb">?</button></dialog>`,
      )
      await call('openModal', 'd')
      await page.focus('#hb')
      await call('openPopover', 'help')
      expect(await call('closeTopIds')).toEqual(['d'])
    })
  })
}
