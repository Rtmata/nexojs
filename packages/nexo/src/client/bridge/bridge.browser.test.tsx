/**
 * bridge in a real browser: the system Chrome driven by Playwright, pages
 * served by keep on a free port. Everything that doesn't need a DOM is
 * tested without one, next to its file.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { chromium, type Browser, type Page } from 'playwright'
import { bridge } from '../../server/bridge'
import { keep, type Server } from '../../server/keep'
import { boat } from '../../shared/boat'
import { segmentsOf } from '../../shared/bridge/segment-url'
import { Component, Segment, render } from '../../shared/omino'

const chrome = Boolean(
  Bun.which('google-chrome') || Bun.which('google-chrome-stable'),
)
if (!chrome) console.warn('bridge: browser tests skipped, no Chrome found')

/** A shelf page: a counter, a list and links that go to the next page. */
class Shelf extends Component<{ n: number; transition?: string }> {
  template() {
    const { n, transition } = this.props
    return (
      <html data-bridge-transition={transition}>
        <head>
          <title>Shelf {n}</title>
          <script type="module" src="/_nexo/bridge.js" />
        </head>
        <body>
          <h1 id="title">Shelf {n}</h1>
          <Segment name="counter" tag="span">
            {n} games
          </Segment>
          <Segment name="shelf">
            <ul>
              <li>game {n}</li>
            </ul>
            <a id="next" href={`/shelf/${n + 1}`}>
              next
            </a>
            <a
              id="counter-link"
              href={`/shelf/${n + 1}`}
              data-bridge-target="counter"
            >
              count
            </a>
            <a id="plain" href={`/shelf/${n + 1}`} data-bridge-target="_none">
              plain
            </a>
            <a id="lost" href="/no-shelf">
              lost
            </a>
            <a id="broken" href="/broken">
              broken
            </a>
          </Segment>
          <a id="outside" href={`/shelf/${n + 1}`}>
            outside
          </a>
        </body>
      </html>
    )
  }
}

const requests: string[] = []
const router = boat()
  .get('/shelf/:n', (ctx) => {
    requests.push(ctx.url.pathname + ctx.url.search)
    const n = Number(ctx.params.n)
    const transition = ctx.url.searchParams.get('transition') ?? undefined
    return render(<Shelf n={n} transition={transition} />, {
      only: only(ctx.url),
    })
  })
  .get('/no-shelf', () => render(<p>no segments here</p>))
  .get('/broken', (ctx) =>
    render(<Segment name="shelf">something went wrong</Segment>, {
      status: 500,
      only: only(ctx.url),
    }),
  )

const only = (url: URL) =>
  segmentsOf(url).length ? segmentsOf(url) : undefined

let server: Server
let browser: Browser
let page: Page

beforeAll(async () => {
  if (!chrome) return
  server = await keep({ router }).use(bridge()).listen(0)
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  page = await (await browser.newContext()).newPage()
})

afterAll(async () => {
  await browser?.close()
  await server?.stop({ grace: 100 })
})

const url = (path: string) => new URL(path, server.url!).href

/** Opens a page and records bridge's events in `window.log`. */
async function open(path: string): Promise<void> {
  await page.goto(url(path))
  await page.evaluate(() => {
    const w = window as unknown as { log: string[]; marker: boolean }
    w.log = []
    w.marker = true
    for (const name of [
      'bridge:fetch',
      'bridge:swap',
      'bridge:swapped',
      'bridge:fail',
    ])
      document.addEventListener(name, () => w.log.push(name))
  })
}

const log = () =>
  page.evaluate(() => (window as unknown as { log: string[] }).log)
const sameDocument = () =>
  page.evaluate(
    () => (window as unknown as { marker?: boolean }).marker === true,
  )
const text = (selector: string) => page.textContent(selector)

describe.if(chrome)('a link inside a segment', () => {
  test('replaces just its segment, asked for alone, and leaves the URL', async () => {
    await open('/shelf/1')
    requests.length = 0
    await page.click('#next')
    await page.waitForSelector('text=game 2')
    expect(await text('#title')).toBe('Shelf 1')
    expect(await text('[data-bridge-segment="counter"]')).toBe('1 games')
    expect(page.url()).toBe(url('/shelf/1'))
    expect(requests).toEqual(['/shelf/2?_segment=shelf'])
    expect(await log()).toEqual([
      'bridge:fetch',
      'bridge:swap',
      'bridge:swapped',
    ])
    expect(await sameDocument()).toBe(true)
  })

  test('the new segment keeps working: links inside it are bridge links too', async () => {
    await open('/shelf/1')
    await page.click('#next')
    await page.waitForSelector('text=game 2')
    await page.click('#next')
    await page.waitForSelector('text=game 3')
    expect(await sameDocument()).toBe(true)
  })

  test('data-bridge-target names another segment', async () => {
    await open('/shelf/1')
    requests.length = 0
    await page.click('#counter-link')
    await page.waitForSelector('text=2 games')
    expect(await text('[data-bridge-segment="shelf"] li')).toBe('game 1')
    expect(requests).toEqual(['/shelf/2?_segment=counter'])
  })

  test('_none leaves the link to the browser', async () => {
    await open('/shelf/1')
    await page.click('#plain')
    await page.waitForURL(url('/shelf/2'))
    expect(await sameDocument()).toBe(false)
  })

  test('outside every segment, the browser navigates', async () => {
    await open('/shelf/1')
    await page.click('#outside')
    await page.waitForURL(url('/shelf/2'))
    expect(await sameDocument()).toBe(false)
  })
})

describe.if(chrome)('when things go wrong', () => {
  test('a response without the segment: bridge:fail, then the browser navigates', async () => {
    await open('/shelf/1')
    await page.click('#lost')
    await page.waitForURL(url('/no-shelf'))
    expect(await text('p')).toBe('no segments here')
  })

  test('a server error page with the segment swaps in like any other', async () => {
    await open('/shelf/1')
    await page.click('#broken')
    await page.waitForSelector('text=something went wrong')
    expect(await sameDocument()).toBe(true)
    expect(await log()).toEqual([
      'bridge:fetch',
      'bridge:swap',
      'bridge:swapped',
    ])
  })
})

describe.if(chrome)('hooks for the page', () => {
  test('cancelling bridge:fetch stops everything', async () => {
    await open('/shelf/1')
    await page.evaluate(() =>
      document.addEventListener('bridge:fetch', (e) => e.preventDefault()),
    )
    requests.length = 0
    await page.click('#next')
    await page.waitForTimeout(150)
    expect(await text('[data-bridge-segment="shelf"] li')).toBe('game 1')
    expect(requests).toEqual([])
    expect(await log()).toEqual(['bridge:fetch'])
  })

  test('cancelling bridge:swap hands the swap over: detail.swap() does it', async () => {
    await open('/shelf/1')
    await page.evaluate(() =>
      document.addEventListener('bridge:swap', (e) => {
        e.preventDefault()
        setTimeout((e as CustomEvent<{ swap(): void }>).detail.swap, 20)
      }),
    )
    await page.click('#next')
    await page.waitForSelector('text=game 2')
    expect(await log()).toEqual(['bridge:fetch', 'bridge:swap'])
  })

  test('data-bridge-transition="true" wraps the swap in a view transition', async () => {
    await open('/shelf/1?transition=true')
    await page.evaluate(() => {
      const w = window as unknown as { transitions: number }
      w.transitions = 0
      document.startViewTransition = (update: () => void) => {
        w.transitions++
        update()
        return { finished: Promise.resolve() } as ViewTransition
      }
    })
    await page.click('#next')
    await page.waitForSelector('text=game 2')
    expect(
      await page.evaluate(
        () => (window as unknown as { transitions: number }).transitions,
      ),
    ).toBe(1)
  })
})
