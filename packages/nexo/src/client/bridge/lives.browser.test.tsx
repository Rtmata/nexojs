/**
 * Segment lifetimes in Chrome: arrivals at load and after a
 * swap, bridge:leave awaited, nested signals ended, data-bridge-persist,
 * component styles a segment brings. Pages served by keep with bridge.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { chromium, type Browser, type Page } from 'playwright'
import { bridge } from '../../server/bridge'
import { keep, type Server } from '../../server/keep'
import { boat } from '../../shared/boat'
import { segmentsOf } from '../../shared/bridge/segment-url'
import { Component, Segment, render, type Child } from '../../shared/omino'

const chrome = Boolean(
  Bun.which('google-chrome') || Bun.which('google-chrome-stable'),
)

class Badge extends Component {
  static styles = [':scope { color: rgb(255, 0, 0) }'] // the root itself: :scope
  template(): Child {
    return <b>badge</b>
  }
}

class Room extends Component<{ n: number }> {
  template(): Child {
    const { n } = this.props
    return (
      <html>
        <head>
          <title>Room {n}</title>
          <script type="importmap">
            {JSON.stringify({
              imports: { '@nexoamigos/nexo/bridge/client': '/_nexo/bridge.js' },
            })}
          </script>
          <script type="module" src="/_nexo/bridge.js" />
        </head>
        <body>
          <Segment name="outer">
            <p id="o">outer {n}</p>
            <Segment name="inner" tag="span">
              inner {n}
            </Segment>
            <div id="radio" data-bridge-persist>
              radio {n}
            </div>
            {n > 1 ? <Badge /> : null}
            <a id="next" href={`/room/${n + 1}`}>
              next
            </a>
          </Segment>
        </body>
      </html>
    )
  }
}

const router = boat().get('/room/:n', ({ params, url }) => {
  const only = segmentsOf(url)
  return render(<Room n={Number(params.n)} />, {
    only: only.length ? only : undefined,
  })
})

let server: Server
let browser: Browser
let page: Page

beforeAll(async () => {
  if (!chrome) return
  server = await keep({ router }).use(bridge()).listen(0)
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  page = await browser.newPage()
})

afterAll(async () => {
  await browser?.close()
  await server?.stop({ grace: 100 })
})

/** Opens room 1 and starts recording arrivals and leaves in `window.seen`. */
async function open(): Promise<void> {
  await page.goto(new URL('/room/1', server.url!).href)
  await page.evaluate(async () => {
    const w = window as any
    const { arrivals } = await import('/_nexo/bridge.js' as string)
    w.seen = []
    w.signals = {}
    const label = (el: Element) =>
      el.getAttribute('data-bridge-segment') ?? el.id ?? el.localName
    arrivals(
      (el: Element, { signal }: { signal: AbortSignal }) => {
        const name = el.localName === 'body' ? 'body' : label(el)
        w.seen.push(`arrive ${name}`)
        w.signals[name] = signal
      },
      { signal: new AbortController().signal },
    )
    document.querySelector('#radio')!.setAttribute('data-mark', 'first')
  })
}

const evaluate = <T,>(fn: () => T) => page.evaluate(fn)

describe.if(chrome)('segment lifetimes', () => {
  test('arrivals: at load, innermost first, the page root last', async () => {
    await open()
    expect(await evaluate(() => (window as any).seen)).toEqual([
      'arrive radio',
      'arrive inner',
      'arrive outer',
      'arrive body',
    ])
  })

  test('bridge:leave is awaited; the old signals end; the new ones arrive', async () => {
    await open()
    await page.evaluate(() => {
      const w = window as any
      document.addEventListener('bridge:leave', (e: any) => {
        w.seen.push(`leave ${e.target.getAttribute('data-bridge-segment')}`)
        e.detail.waitUntil(new Promise((done) => setTimeout(done, 150)))
      })
      w.old = {
        outer: w.signals.outer,
        inner: w.signals.inner,
        radio: w.signals.radio,
      }
    })
    await page.click('#next')
    await page.waitForTimeout(60)
    expect(await page.textContent('#o')).toBe('outer 1')
    await page.waitForSelector('text=outer 2')
    const result = await evaluate(() => {
      const w = window as any
      return {
        seen: w.seen.slice(4),
        outerEnded: w.old.outer.aborted,
        innerEnded: w.old.inner.aborted,
        radioAlive: !w.old.radio.aborted,
        newOuterAlive: !w.signals.outer.aborted,
      }
    })
    expect(result).toEqual({
      seen: ['leave outer', 'arrive radio', 'arrive inner', 'arrive outer'],
      outerEnded: true,
      innerEnded: true,
      radioAlive: true,
      newOuterAlive: true,
    })
  })

  test('data-bridge-persist keeps the element itself', async () => {
    await open()
    await page.click('#next')
    await page.waitForSelector('text=outer 2')
    expect(await page.getAttribute('#radio', 'data-mark')).toBe('first')
    expect(await page.textContent('#radio')).toContain('radio 1')
  })

  test('component styles a segment brings go into the head, once', async () => {
    await open()
    await page.click('#next')
    await page.waitForSelector('text=outer 2')
    await page.click('#next')
    await page.waitForSelector('text=outer 3')
    const result = await evaluate(() => ({
      sheets: document.head.querySelectorAll('style[data-scope-for="Badge"]')
        .length,
      color: getComputedStyle(document.querySelector('b')!).color,
    }))
    expect(result).toEqual({ sheets: 1, color: 'rgb(255, 0, 0)' })
  })

  test('bridge:swapped carries the arrived segment its signal', async () => {
    await open()
    await page.evaluate(() => {
      const w = window as any
      document.addEventListener(
        'bridge:swapped',
        (e: any) => (w.swapped = e.detail.signal),
      )
    })
    await page.click('#next')
    await page.waitForSelector('text=outer 2')
    expect(
      await evaluate(
        () => (window as any).swapped === (window as any).signals.outer,
      ),
    ).toBe(true)
  })
})
