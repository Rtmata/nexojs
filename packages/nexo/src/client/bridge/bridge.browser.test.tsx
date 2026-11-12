/**
 * bridge in a real browser: the system Chrome driven by Playwright, pages
 * served by keep on a free port. Everything that doesn't need a DOM is
 * tested without one, next to its file.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { chromium, type Browser, type Page } from 'playwright'
import { bridge } from '../../server/bridge'
import { keep, type Server } from '../../server/keep'
import { boat, redirect } from '../../shared/boat'
import { segmentsOf } from '../../shared/bridge/segment-url'
import { Component, Segment, render } from '../../shared/omino'

const chrome = Boolean(
  Bun.which('google-chrome') || Bun.which('google-chrome-stable'),
)
if (!chrome) console.warn('bridge: browser tests skipped, no Chrome found')

/** A shelf page: a counter (a twin), a list and links and forms that go to the next page. */
class Shelf extends Component<{ n: number; q: URLSearchParams }> {
  template() {
    const { n, q } = this.props
    const next = `/shelf/${n + 1}${q.has('nested') ? '?nested' : ''}`
    return (
      <html data-bridge-transition={q.get('transition') ?? undefined}>
        <head>
          <title>Shelf {n}</title>
          <script type="importmap">
            {JSON.stringify({
              imports: { '@nexoamigos/nexo/bridge/client': '/_nexo/bridge.js' },
            })}
          </script>
          <script type="module" src="/_nexo/bridge.js" />
          <style>{'body { margin: 0 } .tall { height: 3000px }'}</style>
        </head>
        <body>
          <h1 id="title">Shelf {n}</h1>
          <Segment name="counter" tag="span" data-bridge-twin>
            {n} games
          </Segment>
          <Segment name="errors" tag="p">
            no errors
          </Segment>
          <Segment name="tally" tag="i">
            tally {n}
          </Segment>
          <Segment name="shelf">
            {q.has('nested') ? (
              <Segment name="inner" tag="span" data-bridge-twin>
                inner {n}
              </Segment>
            ) : null}
            {q.has('tall') ? <div class="tall" /> : null}
            <ul>
              <li>game {n}</li>
            </ul>
            <a id="next" href={next}>
              next
            </a>
            <a id="push" href={next} data-bridge-history="push">
              push
            </a>
            <a id="replace" href={next} data-bridge-history="replace">
              replace
            </a>
            <a id="append" href={next} data-bridge-swap="append">
              append
            </a>
            <a id="prepend" href={next} data-bridge-swap="prepend">
              prepend
            </a>
            <a id="counter-link" href={next} data-bridge-target="counter">
              count
            </a>
            <a id="plain" href={next} data-bridge-target="_none">
              plain
            </a>
            <a id="lost" href="/no-shelf">
              lost
            </a>
            <a
              id="hashed"
              href={`/shelf/${n + 1}#far-down`}
              data-bridge-history="push"
            >
              to far down
            </a>
            <a id="bad" href="http://[bad">
              bad
            </a>
            <a
              id="hover-nostore"
              href={`/shelf/${n + 1}?nostore`}
              data-bridge-prefetch="hover"
            >
              hover no store
            </a>
            <a
              id="inner-link"
              href={`/shelf/${n + 5}?nested`}
              data-bridge-target="inner"
            >
              inner
            </a>
            <a
              id="top-slow"
              href={`/shelf/${n + 1}?delay=300`}
              data-bridge-target="_top"
            >
              whole page, slowly
            </a>
            <a id="account" href="/account">
              account
            </a>
            <a id="drop" href={`/shelf/${n + 1}?drop`}>
              drop
            </a>
            <a id="broken" href="/broken">
              broken
            </a>
            <a id="failing" href="/broken" data-bridge-fail="errors">
              failing
            </a>
            <a id="main-error" href="/main-error">
              main error
            </a>
            <a
              id="main-error-two"
              href="/main-error"
              data-bridge-target="shelf, errors"
            >
              main error, twice
            </a>
            <a
              id="tally-push"
              href={next}
              data-bridge-target="tally"
              data-bridge-history="push"
            >
              tally
            </a>
            <a
              id="nostore-slow"
              href={`/shelf/${n + 1}?nostore&delay=200`}
              data-bridge-history="push"
            >
              no store, slowly
            </a>
            <a id="slow" href={`${next}?delay=300`} data-bridge-busy="counter">
              slow
            </a>
            <a id="slow2" href={`/shelf/${n + 2}?delay=300`}>
              slow 2
            </a>
            <a id="hover" href={next} data-bridge-prefetch="hover">
              hover
            </a>
            <a
              id="hover-slow"
              href={`/shelf/${n + 1}?delay=150`}
              data-bridge-prefetch="hover"
              data-bridge-prefetch-delay="0"
            >
              hover slow
            </a>
            <a
              id="hover-flaky"
              href={`/shelf/${n + 1}?flaky`}
              data-bridge-prefetch="hover"
              data-bridge-prefetch-delay="0"
            >
              hover flaky
            </a>
            <a
              id="hover-later"
              href={`/shelf/${n + 30}`}
              data-bridge-prefetch="hover"
              data-bridge-prefetch-delay="300"
            >
              hover flaky
            </a>
            <a
              id="plain-hover"
              href={`/shelf/${n + 20}`}
              data-bridge-target="_none"
              data-bridge-prefetch="hover"
            >
              plain hover
            </a>
            <a id="anchor" href="#far-down">
              down
            </a>
            <a
              id="hover-away"
              href="https://example.invalid/x"
              data-bridge-prefetch="hover"
            >
              hover away
            </a>
            <a
              id="hover-download"
              href={`/shelf/${n + 1}`}
              download
              data-bridge-prefetch="hover"
            >
              hover download
            </a>
            <a
              id="etag-break"
              href={`/shelf/${n + 1}?etag&break`}
              data-bridge-history="push"
            >
              etag that breaks
            </a>
            <a id="to-target" href={next} data-bridge-scroll="target">
              scroll to target
            </a>
            <a
              id="nostore"
              href={`/shelf/${n + 1}?nostore`}
              data-bridge-history="push"
            >
              no store
            </a>
            <a
              id="etag"
              href={`/shelf/${n + 1}?etag`}
              data-bridge-history="push"
            >
              etag
            </a>
            <a
              id="etag-slow"
              href={`/shelf/${n + 1}?etag&delay=200`}
              data-bridge-history="push"
            >
              etag slow
            </a>
            {q.has('etag') ? <i id="version">v{version}</i> : null}
            <form id="search" action="/shelf/7" method="get">
              <input id="q" name="q" value="ryu" />
              <button id="search-go">go</button>
            </form>
            {q.has('autofocus') ? <input id="auto" autofocus /> : null}
            <a id={`to-autofocus-${n}`} href={`/shelf/${n + 1}?autofocus`}>
              autofocus
            </a>
            <a id={`only-${n}`} href={next}>
              only on this page
            </a>
            <a id="quiet" href={next} data-bridge-focus="none">
              quiet
            </a>
            <a id="to-counter" href={next} data-bridge-focus="counter">
              focus the counter
            </a>
            <form id="post" action="/submit" method="post">
              <input name="n" value="9" />
              <button id="post-go">post</button>
            </form>
            <form id="order" action="/order" method="post">
              <button id="order-go">order</button>
            </form>
            <form
              id="order-once"
              action="/order"
              method="post"
              data-bridge-retry="false"
            >
              <button id="order-once-go">order, one try</button>
            </form>
            <form id="notify" action="/notify" method="post">
              <button id="notify-go">notify</button>
            </form>
            <form id="shadow" action="/shelf/7" method="get">
              <input type="hidden" name="action" value="x" />
              <input type="hidden" name="method" value="y" />
              <button id="shadow-go">shadowed</button>
            </form>
            <form id="intent" action="/intent" method="post">
              <button id="intent-archive" name="intent" value="archive">
                archive
              </button>
              <button
                id="intent-delete"
                name="intent"
                value="delete"
                formaction="/intent/delete"
              >
                delete
              </button>
            </form>
            <form id="urlencoded" action="/echo" method="post">
              <input name="q" value="ryu" />
              <button id="urlencoded-go">echo</button>
            </form>
            <form
              id="multipart"
              action="/echo"
              method="post"
              enctype="multipart/form-data"
            >
              <input name="q" value="ryu" />
              <button id="multipart-go">echo</button>
            </form>
            <form
              id="ping"
              action="/ping"
              method="post"
              data-bridge-target="errors"
            >
              <button id="ping-go">ping</button>
            </form>
            <form id="blank" action="/thanks" method="get">
              <button id="blank-go" formtarget="_blank">
                open elsewhere
              </button>
            </form>
            <form id="slow-post" action="/echo?delay=300" method="post">
              <button id="slow-post-go">slow post</button>
            </form>
            <dialog id="dialog">
              <form method="dialog">
                <button id="dialog-close">close</button>
              </form>
            </dialog>
          </Segment>
          <div class="tall" />
          <p id="far-down">far down</p>
          <a id="outside" href={next}>
            outside
          </a>
          <a id="outside-hover" href="/shelf/9" data-bridge-prefetch="hover">
            outside hover
          </a>
          {q.has('lazy') ? <LazyBits n={n} /> : null}
        </body>
      </html>
    )
  }
}

/** Extras for the lazy tests: a self-loading segment, scroll markers and a "more" link. */
class LazyBits extends Component<{ n: number }> {
  template() {
    const { n } = this.props
    return (
      <>
        <Segment name="side" data-bridge-src="/side" data-bridge-load="eager">
          loading side
        </Segment>
        <SelfLoading n={n} />
        <h2 data-bridge-hex={`/shelf/${n}`}>Year {n}</h2>
        <div class="tall" />
        <h2 id="far" data-bridge-hex="/shelf/5">
          Year 5
        </h2>
        <div class="tall" />
        <a
          id="more"
          href={`/shelf/${n + 1}`}
          data-bridge-target="shelf"
          data-bridge-swap="append"
          data-bridge-load="viewport"
        >
          more
        </a>
        <a
          id="more-away"
          href="https://example.invalid/more"
          data-bridge-target="shelf"
          data-bridge-load="eager"
        >
          more, elsewhere
        </a>
        <div class="tall" />
        <Segment
          name="flaky"
          data-bridge-src="/flaky"
          data-bridge-load="viewport"
        >
          waiting
        </Segment>
      </>
    )
  }
}

/** A segment that renders itself with its own `src`: it must load once, not forever. */
class SelfLoading extends Component<{ n: number }> {
  template() {
    return (
      <Segment name="self" data-bridge-src="/self" data-bridge-load="eager">
        self {this.props.n}
      </Segment>
    )
  }
}

/** A whole-page site: every link swaps the full page; a body script counts how often it ran. */
class Top extends Component<{
  n: number
  theme: string
  lazy: boolean
  etag: boolean
}> {
  template() {
    const { n, theme, lazy, etag } = this.props
    return (
      <html data-bridge-target="_top" lang={`l${n}`}>
        <head>
          <title>Top {n}</title>
          <meta name="page" content={`${n}`} />
          <script type="module" src="/_nexo/bridge.js" data-bridge-track />
          <link rel="stylesheet" href={`/themes/${theme}`} data-bridge-track />
          <link rel="stylesheet" href={`/pages/${n}`} />
          <style id={`style-${n}`}>
            {`body { margin: 0 } .tall { height: 3000px }`}
          </style>
        </head>
        <body>
          <h1 id="title">Top {n}</h1>
          <a id="next" href={`/top/${n + 1}`}>
            next
          </a>
          <a id={`only-${n}`} href={`/top/${n + 1}`}>
            only on this page
          </a>
          <a id="replace" href={`/top/${n + 1}`} data-bridge-history="replace">
            replace
          </a>
          <a id="other-theme" href={`/top/${n + 1}?theme=dark`}>
            dark
          </a>
          <a id="none" href={`/top/${n + 1}`} data-bridge-target="_none">
            plain
          </a>
          <a id="hover" href={`/top/${n + 1}`} data-bridge-prefetch="hover">
            hover
          </a>
          <a
            id="none-hover"
            href={`/top/${n + 10}`}
            data-bridge-target="_none"
            data-bridge-prefetch="hover"
          >
            plain hover
          </a>
          <a id="etag" href={`/top/${n + 1}?etag&delay=200`}>
            etag, slowly
          </a>
          {etag ? <i id="version">v{version}</i> : null}
          <Segment name="note" tag="p">
            <a id="note-link" href={`/top/${n + 1}`} data-bridge-target="note">
              note
            </a>{' '}
            note {n}
          </Segment>
          {lazy ? <div class="tall" /> : null}
          {lazy ? (
            <Segment
              name="footer"
              data-bridge-src="/footer"
              data-bridge-load="viewport"
            >
              loading footer
            </Segment>
          ) : null}
          <script>{'window.ran = (window.ran || 0) + 1'}</script>
        </body>
      </html>
    )
  }
}

const requests: string[] = []
let orders = 0
/** The Idempotency-Key each order came with. */
const keys: (string | null)[] = []
let notifies = 0
const intents: string[] = []
/** The shelf's version, told by an ETag when `?etag` asks for one. */
let version = 1
/** The theme `/top` pages come with unless asked otherwise: a deploy changes it. */
let topTheme = 'light'
const router = boat()
  .get('/shelf/:n', async (ctx) => {
    // Chrome's own prefetches (Speculation Rules) are not what these tests count.
    if (!ctx.request.headers.get('sec-purpose'))
      requests.push(ctx.url.pathname + ctx.url.search)
    const delay = Number(ctx.url.searchParams.get('delay') ?? 0)
    if (delay) await Bun.sleep(delay)
    const q = ctx.url.searchParams
    const tag = `"v${version}"`
    if (q.has('break') && ctx.request.headers.get('if-none-match'))
      return new Response('<p>broken</p>', { status: 500 })
    if (q.has('etag') && ctx.request.headers.get('if-none-match') === tag)
      return new Response(null, { status: 304, headers: { etag: tag } })
    const headers: Record<string, string> = q.has('etag')
      ? { etag: tag, 'cache-control': 'max-age=0' }
      : q.has('nostore')
        ? { 'cache-control': 'no-store' }
        : {}
    const n = Number(ctx.params.n)
    return render(<Shelf n={n} q={q} />, { only: only(ctx.url), headers })
  })
  .post('/submit', async (ctx) => {
    const data = await ctx.request.formData()
    return redirect(`/shelf/${data.get('n')}`, 303)
  })
  .post('/order', (ctx) => {
    orders++
    keys.push(ctx.request.headers.get('idempotency-key'))
    return redirect('/thanks', 303)
  })
  .post('/notify', (ctx) => {
    notifies++
    return render(<Segment name="other">noted</Segment>, {
      only: only(ctx.url),
    })
  })
  .get('/notify', () =>
    render(
      <main>
        <h2>Notified</h2>
      </main>,
    ),
  )
  .post('/intent/delete', async (ctx) => {
    const data = await ctx.request.formData()
    intents.push(`${ctx.url.pathname} ${data.get('intent')}`)
    return redirect('/shelf/1', 303)
  })
  .post('/echo', async (ctx) => {
    const delay = Number(ctx.url.searchParams.get('delay') ?? 0)
    if (delay) await Bun.sleep(delay)
    return render(
      <Segment name="shelf">
        sent as {ctx.request.headers.get('content-type')?.split(';')[0]}
      </Segment>,
      { only: only(ctx.url) },
    )
  })
  .get('/account', (ctx) =>
    render(
      <main>
        <h2>Account</h2>
      </main>,
      { only: only(ctx.url) },
    ),
  )
  .get('/self', (ctx) => {
    requests.push(ctx.url.pathname + ctx.url.search)
    return render(<SelfLoading n={99} />, { only: only(ctx.url) })
  })
  .get('/thanks', () =>
    render(
      <main>
        <h2>Thanks</h2>
      </main>,
    ),
  )
  .get('/main-error', () =>
    render(
      <main>
        <h2>Lost room</h2>
      </main>,
      { status: 404 },
    ),
  )
  .get('/top/:n', async (ctx) => {
    if (!ctx.request.headers.get('sec-purpose'))
      requests.push(ctx.url.pathname + ctx.url.search)
    const q = ctx.url.searchParams
    const delay = Number(q.get('delay') ?? 0)
    if (delay) await Bun.sleep(delay)
    const tag = `"t${version}"`
    if (q.has('etag') && ctx.request.headers.get('if-none-match') === tag)
      return new Response(null, { status: 304, headers: { etag: tag } })
    const headers: Record<string, string> = q.has('etag')
      ? { etag: tag, 'cache-control': 'max-age=0' }
      : {}
    const theme = q.get('theme') ?? topTheme
    const props = { theme, lazy: q.has('lazy'), etag: q.has('etag') }
    return render(<Top n={Number(ctx.params.n)} {...props} />, { headers })
  })
  .get('/themes/:name', () => css('body{}'))
  .get('/pages/:n', (ctx) => css(`#title{color:rgb(${ctx.params.n},0,0)}`))
  .get('/side', (ctx) => {
    requests.push(ctx.url.pathname + ctx.url.search)
    return render(
      <Segment name="side">
        side loaded{' '}
        <a id="side-link" href="/shelf/50">
          in side
        </a>
      </Segment>,
      { only: only(ctx.url) },
    )
  })
  .get('/footer', (ctx) =>
    render(<Segment name="footer">footer loaded</Segment>, {
      only: only(ctx.url),
    }),
  )
  .post('/ping', (ctx) =>
    render(<Segment name="errors">pinged</Segment>, { only: only(ctx.url) }),
  )
  .get('/flaky', (ctx) =>
    render(<Segment name="flaky">flaky loaded</Segment>, {
      only: only(ctx.url),
    }),
  )
  .get('/no-shelf', () => render(<p>no segments here</p>))
  .get('/broken', (ctx) => {
    requests.push(ctx.url.pathname + ctx.url.search)
    return render(<Segment name="shelf">something went wrong</Segment>, {
      status: 500,
      only: only(ctx.url),
    })
  })

const css = (text: string) =>
  new Response(text, { headers: { 'content-type': 'text/css' } })

const only = (url: URL) =>
  segmentsOf(url).length ? segmentsOf(url) : undefined

let server: Server
let browser: Browser
let page: Page
const pageErrors: string[] = []

beforeAll(async () => {
  if (!chrome) return
  server = await keep({ router }).use(bridge()).listen(0)
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  page = await (await browser.newContext()).newPage()
  page.on('pageerror', (error) => {
    pageErrors.push(error.message)
    console.error('page error:', error.message)
  })
  page.on('console', (message) => {
    if (message.type() === 'error') console.error('console:', message.text())
  })
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
      'bridge:cancel',
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
    expect(await text('[data-bridge-segment="errors"]')).toBe('no errors')
    expect(page.url()).toBe(url('/shelf/1'))
    expect(requests).toEqual(['/shelf/2?_segment=shelf,counter'])
    // swapped once per segment: the target and the counter twin
    expect(await log()).toEqual([
      'bridge:fetch',
      'bridge:swap',
      'bridge:swapped',
      'bridge:swapped',
    ])
    expect(await sameDocument()).toBe(true)
  })

  test('a link with a #hash: the URL keeps it and the page scrolls there', async () => {
    await open('/shelf/1')
    await page.click('#hashed')
    await page.waitForSelector('text=game 2')
    expect(page.url()).toBe(url('/shelf/2#far-down'))
    expect(await page.evaluate(() => scrollY)).toBeGreaterThan(2000)
  })

  test('a link that cannot be parsed is nowhere: the scan of new content goes on', async () => {
    await open('/shelf/1')
    pageErrors.length = 0
    await page.click('#next')
    await page.waitForSelector('text=game 2')
    expect(pageErrors).toEqual([])
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

  test('a jump within the page is left to the browser', async () => {
    await open('/shelf/1')
    requests.length = 0
    await page.click('#anchor')
    await page.waitForFunction(() => location.hash === '#far-down')
    expect(await page.evaluate(() => scrollY)).toBeGreaterThan(1000)
    expect(requests).toEqual([])
    expect(await log()).toEqual([])
  })

  test('outside every segment, the browser navigates', async () => {
    await open('/shelf/1')
    await page.click('#outside')
    await page.waitForURL(url('/shelf/2'))
    expect(await sameDocument()).toBe(false)
  })
})

describe.if(chrome)('when things go wrong', () => {
  test('a response without the segment lands as the whole page, same document', async () => {
    await open('/shelf/1')
    await page.click('#lost')
    await page.waitForSelector('text=no segments here')
    expect(page.url()).toBe(url('/no-shelf'))
    expect(await sameDocument()).toBe(true)
    // the response came whole (it has a doctype): it goes in as it is, no second request
    expect(await log()).toEqual([
      'bridge:fetch',
      'bridge:fail',
      'bridge:swap',
      'bridge:swapped',
    ])
  })

  test('a route that honours ?_segment but lacks the segment: the page is fetched whole', async () => {
    await open('/shelf/1')
    await page.click('#account')
    await page.waitForSelector('h2:has-text("Account")')
    expect(page.url()).toBe(url('/account'))
    expect(await sameDocument()).toBe(true)
  })

  test('a POST answered with a page without the segment is never sent again', async () => {
    await open('/shelf/1')
    orders = 0
    await page.click('#order-go')
    await page.waitForSelector('text=Thanks')
    expect(page.url()).toBe(url('/thanks'))
    expect(await sameDocument()).toBe(true)
    expect(orders).toBe(1)
  })

  test('a landing that gets no response: the browser loads the page, the form is never sent again', async () => {
    await open('/shelf/1')
    notifies = 0
    await page.route(
      (u) => u.pathname === '/notify',
      (route) => {
        const request = route.request()
        const landing =
          request.method() === 'GET' && request.resourceType() === 'fetch'
        return landing ? route.abort() : route.continue()
      },
    )
    await page.click('#notify-go') // answered with a fragment for another segment
    await page.waitForFunction(() => !('marker' in window))
    await page.waitForSelector('h2:has-text("Notified")')
    await page.unrouteAll()
    expect(page.url()).toBe(url('/notify'))
    expect(notifies).toBe(1)
  })

  test('no response to a POST: nothing is sent again, bridge:fail tells the page, the form is free', async () => {
    await open('/shelf/1')
    intents.length = 0
    await page.route(
      (u) => u.pathname === '/intent/delete',
      (route) =>
        route.request().resourceType() === 'fetch'
          ? route.abort()
          : route.continue(),
    )
    await page.click('#intent-delete')
    await page.waitForFunction(() =>
      (window as unknown as { log: string[] }).log.includes('bridge:fail'),
    )
    await page.waitForTimeout(100)
    await page.unrouteAll()
    expect(await sameDocument()).toBe(true)
    expect(page.url()).toBe(url('/shelf/1'))
    expect(intents).toEqual([])
    expect(await page.getAttribute('#intent', 'data-active')).toBeNull()
  })

  test('a POST whose response was lost is sent again with its key, and the server answers it once', async () => {
    await open('/shelf/1')
    orders = 0
    keys.length = 0
    let lost = false
    await page.route(
      (u) => u.pathname === '/order',
      async (route) => {
        if (lost) return route.continue()
        lost = true
        await route.fetch() // the server gets it; the browser never sees the answer
        return route.abort()
      },
    )
    await page.click('#order-go')
    await page.waitForSelector('text=Thanks')
    await page.unrouteAll()
    expect(orders).toBe(1)
    expect(keys).toEqual([expect.stringMatching(/^[0-9a-f]{32}$/)])
    expect(await sameDocument()).toBe(true)
    // the second fetch is the quiet retry; the fail is the landing's: a page without the segment
    expect(await log()).toEqual([
      'bridge:fetch',
      'bridge:fetch',
      'bridge:fail',
      'bridge:swap',
      'bridge:swapped',
    ])
  })

  test('data-bridge-retry="false": one try, then bridge:fail', async () => {
    await open('/shelf/1')
    let tries = 0
    await page.route(
      (u) => u.pathname === '/order',
      (route) => {
        if (route.request().resourceType() !== 'fetch') return route.continue()
        tries++
        return route.abort()
      },
    )
    await page.click('#order-once-go')
    await page.waitForFunction(() =>
      (window as unknown as { log: string[] }).log.includes('bridge:fail'),
    )
    await page.waitForTimeout(100)
    await page.unrouteAll()
    expect(tries).toBe(1)
    expect(await sameDocument()).toBe(true)
  })

  test('a navigation that joined a prefetch which then fails asks normally', async () => {
    await open('/shelf/1')
    let first = true
    await page.route(
      (u) => u.searchParams.has('flaky'),
      async (route) => {
        if (!first) return route.continue()
        first = false
        await new Promise((r) => setTimeout(r, 100))
        return route.abort()
      },
    )
    await page.hover('#hover-flaky')
    await page.click('#hover-flaky')
    await page.waitForSelector('text=game 2')
    expect(await sameDocument()).toBe(true)
    await page.unrouteAll()
  })

  test('no response at all: the browser follows the link its own way', async () => {
    await open('/shelf/1')
    await page.route(
      (u) => u.searchParams.has('drop'),
      (route) =>
        route.request().resourceType() === 'fetch'
          ? route.abort()
          : route.continue(),
    )
    await page.click('#drop')
    await page.waitForURL(url('/shelf/2?drop'))
    expect(await sameDocument()).toBe(false)
    await page.unrouteAll()
  })

  test('a server error page with the segment swaps in like any other', async () => {
    await open('/shelf/1')
    await page.click('#broken')
    await page.waitForSelector('text=something went wrong')
    expect(await sameDocument()).toBe(true)
    expect(await log()).toEqual([
      'bridge:fetch',
      'bridge:fail',
      'bridge:swap',
      'bridge:swapped',
    ])
  })

  test('data-bridge-fail sends the error to another segment', async () => {
    await open('/shelf/1')
    await page.click('#failing')
    await page.waitForSelector('text=something went wrong')
    expect(await text('[data-bridge-segment="errors"]')).toBe(
      'something went wrong',
    )
    expect(await text('[data-bridge-segment="shelf"] li')).toBe('game 1')
  })

  test('an error answer is never kept: asking again asks the server again', async () => {
    await open('/shelf/1')
    requests.length = 0
    await page.click('#failing')
    await page.waitForSelector('text=something went wrong')
    await page.click('#failing')
    await page.waitForTimeout(100)
    expect(requests).toEqual([
      '/broken?_segment=shelf,counter',
      '/broken?_segment=shelf,counter',
    ])
  })

  test('an error page without the segment: its <main> goes into the target', async () => {
    await open('/shelf/1')
    await page.click('#main-error')
    await page.waitForSelector('text=Lost room')
    expect(await text('[data-bridge-segment="shelf"] h2')).toBe('Lost room')
    expect(await sameDocument()).toBe(true)
  })
})

describe.if(chrome)('focus after a swap', () => {
  const focused = () =>
    page.evaluate(() => {
      const active = document.activeElement
      return active === document.body
        ? 'body'
        : active?.id || active?.getAttribute('data-bridge-segment')
    })

  test('a link that left with the old content: the new segment takes the focus', async () => {
    await open('/shelf/1')
    await page.click('#only-1')
    await page.waitForSelector('text=game 2')
    expect(await focused()).toBe('shelf')
  })

  test('a link the new content has again, by id, keeps the focus: "next" can be pressed in a row', async () => {
    await open('/shelf/1')
    await page.click('#next')
    await page.waitForSelector('text=game 2')
    expect(await focused()).toBe('next')
  })

  test('a field whose results refresh keeps the focus, by its id', async () => {
    await open('/shelf/1')
    await page.focus('#q')
    await page.keyboard.press('Enter')
    await page.waitForSelector('text=game 7')
    expect(await focused()).toBe('q')
  })

  test('an autofocus in the new content wins over the segment', async () => {
    await open('/shelf/1')
    await page.click('#to-autofocus-1')
    await page.waitForSelector('text=game 2')
    expect(await focused()).toBe('auto')
  })

  test('a trigger that stays keeps the focus', async () => {
    await open('/shelf/1')
    await page.click('#counter-link')
    await page.waitForSelector('text=2 games')
    expect(await focused()).toBe('counter-link')
  })

  test('data-bridge-focus: none leaves it, a name sends it to that segment', async () => {
    await open('/shelf/1')
    await page.click('#quiet')
    await page.waitForSelector('text=game 2')
    expect(await focused()).toBe('body')
    await page.click('#to-counter')
    await page.waitForSelector('text=game 3')
    expect(await focused()).toBe('counter')
  })

  test('a whole page starts at the top of the document, as after a native navigation', async () => {
    await open('/top/1')
    await page.click('#only-1')
    await page.waitForSelector('h1:has-text("Top 2")')
    expect(await focused()).toBe('body')
    expect(
      await page.evaluate(() => document.body.hasAttribute('tabindex')),
    ).toBe(true)
  })

  test('a return moves nothing', async () => {
    await open('/shelf/1')
    await page.click('#push')
    await page.waitForSelector('text=game 2')
    await page.focus('#outside')
    await page.goBack()
    await page.waitForSelector('text=game 1')
    expect(await focused()).toBe('outside')
  })
})

describe.if(chrome)('history and scroll', () => {
  test('an error page without the segments goes into every target, whole', async () => {
    await open('/shelf/1')
    await page.click('#main-error-two')
    await page.waitForSelector(
      '[data-bridge-segment="errors"]:has-text("Lost room")',
    )
    expect(await text('[data-bridge-segment="shelf"]')).toContain('Lost room')
  })

  test('the fresh element an error page goes into carries no loading state', async () => {
    await open('/shelf/1')
    await page.click('#main-error')
    await page.waitForSelector('h2:has-text("Lost room")')
    const busy = await page.getAttribute(
      '[data-bridge-segment="shelf"]',
      'aria-busy',
    )
    expect(busy).toBeNull()
  })

  test('push adds an entry; back and forward swap the segment again, from the cache', async () => {
    await open('/shelf/1')
    await page.click('#push')
    await page.waitForSelector('text=game 2')
    expect(page.url()).toBe(url('/shelf/2'))
    requests.length = 0
    await page.goBack()
    await page.waitForSelector('text=game 1')
    expect(page.url()).toBe(url('/shelf/1'))
    await page.goForward()
    await page.waitForSelector('text=game 2')
    // the first page was never fetched by segments; the second is in the cache
    expect(requests).toEqual(['/shelf/1?_segment=shelf,counter'])
    expect(await sameDocument()).toBe(true)
  })

  test('a response with no-store is never reused: forward fetches it again', async () => {
    await open('/shelf/1')
    requests.length = 0
    await page.click('#nostore')
    await page.waitForSelector('text=game 2')
    await page.goBack()
    await page.waitForSelector('text=game 1')
    await page.goForward()
    await page.waitForSelector('text=game 2')
    expect(requests.filter((r) => r.startsWith('/shelf/2'))).toHaveLength(2)
  })

  test('going back to a stale page shows it at once and asks again with its ETag', async () => {
    await open('/shelf/1')
    version = 1
    await page.click('#etag')
    await page.waitForSelector('text=v1')
    await page.goBack()
    await page.waitForSelector('text=game 1')
    requests.length = 0
    await page.goForward()
    await page.waitForSelector('text=v1')
    await page.waitForFunction(() => true)
    await page.waitForTimeout(100)
    // one revalidation, answered 304: the page stays as it was
    expect(requests).toEqual(['/shelf/2?etag&_segment=shelf,counter'])
    expect(await text('#version')).toBe('v1')
    version = 2
    await page.goBack()
    await page.waitForSelector('text=game 1')
    await page.goForward()
    await page.waitForSelector('text=v2') // shown stale first, then the newer page swapped in
    expect(await sameDocument()).toBe(true)
  })

  test('a revalidation answered with an error changes nothing: the stale page stays', async () => {
    await open('/shelf/1')
    version = 1
    await page.click('#etag-break')
    await page.waitForSelector('text=v1')
    await page.goBack()
    await page.waitForSelector('text=game 1')
    requests.length = 0
    await page.goForward()
    await page.waitForSelector('text=v1')
    await page.waitForTimeout(300)
    expect(requests).toEqual(['/shelf/2?etag&break&_segment=shelf,counter'])
    expect(await text('#version')).toBe('v1')
  })

  test('a newer page arriving after a click on the restored content leaves the click alone', async () => {
    await open('/shelf/1')
    version = 1
    await page.click('#etag-slow')
    await page.waitForSelector('text=v1')
    await page.goBack()
    await page.waitForSelector('text=game 1')
    version = 2
    await page.goForward() // stale v1 at once; the revalidation takes 200 ms
    await page.waitForSelector('text=v1')
    await page.click('#next') // no entry: the URL stays
    await page.waitForSelector('text=game 3')
    await page.waitForTimeout(400)
    expect(await text('[data-bridge-segment="shelf"] li')).toBe('game 3')
  })

  test('two returns in a row, the first cut short: everything between is still brought', async () => {
    await open('/shelf/1')
    await page.click('#nostore-slow')
    await page.waitForSelector('text=game 2')
    await page.click('#tally-push')
    await page.waitForSelector('text=tally 3')
    await page.evaluate(() => {
      history.back()
      setTimeout(() => history.back(), 20)
    })
    await page.waitForSelector('text=game 1')
    await page.waitForFunction(
      () =>
        document.querySelector('[data-bridge-segment="tally"]')!.textContent ===
        'tally 1',
    )
    expect(page.url()).toBe(url('/shelf/1'))
  })

  test('a return brings what changed between the entries, not the whole page again', async () => {
    await open('/shelf/1')
    await page.click('#top-slow') // the whole page
    await page.waitForSelector('text=game 2')
    await page.click('#push') // the shelf only
    await page.waitForSelector('text=game 3')
    requests.length = 0
    await page.goBack()
    await page.waitForSelector('text=game 2')
    expect(requests).toEqual(['/shelf/2?delay=300&_segment=shelf,counter'])
    expect(await sameDocument()).toBe(true)
  })

  test('a newer page arriving while the visitor asked for something else yields to it', async () => {
    await open('/shelf/1')
    version = 1
    await page.click('#etag-slow')
    await page.waitForSelector('text=v1')
    await page.goBack()
    await page.waitForSelector('text=game 1')
    version = 2
    await page.goForward() // stale v1 at once; revalidation takes 200 ms
    await page.waitForSelector('text=v1')
    await page.click('#slow') // /shelf/2?delay=300 on the same target
    await page.waitForTimeout(600)
    expect(await page.$('#version')).toBeNull() // the slow page, not v2
    expect(await text('[data-bridge-segment="shelf"] li')).toBe('game 3')
  })

  test('a newer page arriving after the visitor moved on is not shown', async () => {
    await open('/shelf/1')
    version = 1
    await page.click('#etag-slow')
    await page.waitForSelector('text=v1')
    await page.goBack()
    await page.waitForSelector('text=game 1')
    version = 2
    await page.goForward() // stale v1 at once; revalidation takes 200 ms
    await page.waitForSelector('text=v1')
    await page.click('#push') // meanwhile: on to shelf 3
    await page.waitForSelector('text=game 3')
    await page.waitForTimeout(400)
    expect(await text('[data-bridge-segment="shelf"] li')).toBe('game 3')
    expect(page.url()).toBe(url('/shelf/3'))
  })

  test('replace rewrites the entry', async () => {
    await open('/shelf/1')
    await page.click('#push')
    await page.waitForSelector('text=game 2')
    await page.click('#replace')
    await page.waitForSelector('text=game 3')
    expect(page.url()).toBe(url('/shelf/3'))
    await page.goBack()
    await page.waitForSelector('text=game 1')
    expect(page.url()).toBe(url('/shelf/1'))
  })

  test('a jump over several entries restores everything swapped in between', async () => {
    await open('/shelf/1')
    await page.click('#push') // entry 2: shelf
    await page.waitForSelector('text=game 2')
    await page.evaluate(() =>
      document
        .getElementById('counter-link')!
        .setAttribute('data-bridge-history', 'push'),
    )
    await page.click('#counter-link') // entry 3: counter
    await page.waitForSelector('text=3 games')
    await page.evaluate(() => history.go(-2))
    await page.waitForSelector('text=game 1')
    expect(await text('[data-bridge-segment="counter"]')).toBe('1 games')
    expect(page.url()).toBe(url('/shelf/1'))
  })

  test('the scroll remembered for back is the one before the swap, not after the page shrank', async () => {
    await open('/shelf/1?tall')
    await page.evaluate(() => scrollTo(0, 5000))
    await page.evaluate(() => document.getElementById('push')!.click()) // shelf 2 is short
    await page.waitForSelector('text=game 2')
    expect(await page.evaluate(() => scrollY)).toBeLessThan(5000)
    await page.goBack()
    await page.waitForSelector('text=game 1')
    await page.waitForFunction(() => scrollY === 5000)
  })

  test('a reload comes back where the page was scrolled', async () => {
    await open('/shelf/1')
    await page.evaluate(() => scrollTo(0, 700))
    await page.waitForTimeout(300) // the position settles into the entry
    await page.reload()
    await page.waitForFunction(() => scrollY === 700)
  })

  test('back restores where the page was scrolled', async () => {
    await open('/shelf/1')
    await page.evaluate(() => scrollTo(0, 500))
    await page.evaluate(() => document.getElementById('push')!.click()) // no auto-scroll
    await page.waitForSelector('text=game 2')
    expect(await page.evaluate(() => scrollY)).toBe(500) // segments keep the scroll
    await page.evaluate(() => scrollTo(0, 900))
    await page.goBack()
    await page.waitForSelector('text=game 1')
    await page.waitForFunction(() => scrollY === 500)
  })

  test('a pushed page reloads where it was, even when never scrolled there', async () => {
    await open('/shelf/1')
    await page.evaluate(() => scrollTo(0, 500))
    await page.evaluate(() => document.getElementById('push')!.click()) // keeps the scroll
    await page.waitForSelector('text=game 2')
    await page.reload()
    await page.waitForFunction(() => scrollY === 500)
  })

  test('a return whose page can no longer be swapped replaces the entry; forward stays', async () => {
    await open('/shelf/1')
    await page.click('#push')
    await page.waitForSelector('text=game 2')
    await page.route(
      (u) => u.pathname === '/shelf/1',
      (route) =>
        route.request().resourceType() === 'fetch'
          ? route.fulfill({
              contentType: 'text/html',
              body: '<!doctype html><title>Gone</title><p id="gone">gone</p>',
            })
          : route.continue(),
    )
    await page.goBack()
    await page.waitForSelector('#gone')
    await page.unrouteAll()
    expect(page.url()).toBe(url('/shelf/1'))
    await page.goForward()
    await page.waitForSelector('text=game 2')
    expect(await sameDocument()).toBe(true)
  })

  test('back from a #hash jump the browser made brings nothing: same content', async () => {
    await open('/shelf/1')
    await page.click('#push')
    await page.waitForSelector('text=game 2')
    await page.click('#anchor')
    await page.waitForTimeout(200)
    expect(page.url()).toBe(url('/shelf/2#far-down'))
    requests.length = 0
    const fetches = (await log()).filter((e) => e === 'bridge:fetch').length
    await page.goBack()
    await page.waitForFunction((u) => location.href === u, url('/shelf/2'))
    await page.waitForTimeout(200)
    expect(requests).toEqual([])
    const after = (await log()).filter((e) => e === 'bridge:fetch').length
    expect(after).toBe(fetches)
    expect(await text('[data-bridge-segment="shelf"] li')).toBe('game 2')
  })

  test('a scroll just before a return is not written into the entry returned to', async () => {
    await open('/shelf/1?delay=200')
    await page.evaluate(() => scrollTo(0, 500))
    await page.waitForTimeout(300)
    await page.evaluate(() => document.getElementById('push')!.click())
    await page.waitForSelector('text=game 2')
    await page.evaluate(() => {
      scrollTo(0, 900)
      history.back() // before the scroll settles into the entry
    })
    await page.waitForSelector('text=game 1')
    await page.waitForFunction(() => scrollY === 500)
    const kept = await page.evaluate(() => history.state.bridge.scrollY)
    expect(kept).toBe(500)
  })

  test('a new entry starts clean: what the page kept in the old one stays there', async () => {
    await open('/shelf/1')
    await page.evaluate(() =>
      history.replaceState({ ...history.state, draft: 'ryu' }, ''),
    )
    await page.click('#push')
    await page.waitForSelector('text=game 2')
    expect(await page.evaluate(() => history.state.draft)).toBeUndefined()
    await page.goBack()
    await page.waitForSelector('text=game 1')
    expect(await page.evaluate(() => history.state.draft)).toBe('ryu')
  })

  test('a URL the page changed itself survives the scroll settling', async () => {
    await open('/shelf/1')
    await page.evaluate(() => history.replaceState(history.state, '', '?tab=2'))
    await page.evaluate(() => scrollTo(0, 300))
    await page.waitForTimeout(300)
    expect(page.url()).toBe(url('/shelf/1?tab=2'))
    await page.reload()
    await page.waitForFunction(() => scrollY === 300)
  })

  test('a jump to a #hash keeps its hash once the scroll settles', async () => {
    await open('/shelf/1')
    await page.click('#anchor')
    await page.waitForTimeout(400)
    expect(page.url()).toBe(url('/shelf/1#far-down'))
    await page.evaluate(() => scrollTo(0, 100))
    await page.waitForTimeout(300)
    expect(page.url()).toBe(url('/shelf/1#far-down'))
  })

  test('a first visit to a #hash stays where the browser put it', async () => {
    await open('/shelf/1#far-down')
    await page.waitForTimeout(100)
    expect(await page.evaluate(() => scrollY)).toBeGreaterThan(2000)
  })

  test("two returns in a row: the scroll is the last entry's", async () => {
    await open('/shelf/1')
    await page.evaluate(() => scrollTo(0, 1000))
    await page.evaluate(() => document.getElementById('push')!.click())
    await page.waitForSelector('text=game 2')
    await page.evaluate(() => scrollTo(0, 2000))
    await page.waitForTimeout(300)
    await page.evaluate(() => document.getElementById('push')!.click())
    await page.waitForSelector('text=game 3')
    await page.evaluate(() => {
      history.back()
      setTimeout(() => history.back(), 20)
    })
    await page.waitForSelector('text=game 1')
    await page.waitForTimeout(300)
    expect(await page.evaluate(() => scrollY)).toBe(1000)
  })

  test('data-bridge-scroll="target" scrolls the new segment into view', async () => {
    await open('/shelf/1')
    await page.evaluate(() => scrollTo(0, 2500))
    await page.evaluate(() => document.getElementById('to-target')!.click())
    await page.waitForSelector('text=game 2')
    expect(await page.evaluate(() => scrollY)).toBeLessThan(200)
  })
})

describe.if(chrome)('forms', () => {
  test('a submit something else already stopped is left alone', async () => {
    await open('/shelf/1')
    await page.evaluate(() =>
      document
        .getElementById('search')!
        .addEventListener('submit', (e) => e.preventDefault()),
    )
    requests.length = 0
    await page.click('#search-go')
    await page.waitForTimeout(150)
    expect(requests).toEqual([])
    expect(await text('[data-bridge-segment="shelf"] li')).toBe('game 1')
  })

  test('fields travel URL-encoded by default, multipart when the form says so', async () => {
    await open('/shelf/1')
    await page.click('#urlencoded-go')
    await page.waitForSelector('text=sent as application/x-www-form-urlencoded')
    await open('/shelf/1')
    await page.click('#multipart-go')
    await page.waitForSelector('text=sent as multipart/form-data')
  })

  test('a GET form puts its fields in the URL and swaps its segment', async () => {
    await open('/shelf/1')
    requests.length = 0
    await page.click('#search-go')
    await page.waitForSelector('text=game 7')
    expect(requests).toEqual(['/shelf/7?q=ryu&_segment=shelf,counter'])
    expect(await sameDocument()).toBe(true)
  })

  test('fields named action or method do not shadow the form', async () => {
    await open('/shelf/1')
    requests.length = 0
    await page.click('#shadow-go')
    await page.waitForSelector('text=game 7')
    expect(requests).toEqual([
      '/shelf/7?action=x&method=y&_segment=shelf,counter',
    ])
  })

  test('a prefetch still on its way when a POST happens is not kept', async () => {
    await open('/shelf/1')
    requests.length = 0
    await page.hover('#hover-slow') // /shelf/2?delay=150 on its way
    await page.click('#post-go')
    await page.waitForSelector('text=game 9')
    await page.waitForTimeout(250) // the prefetch has landed by now
    await page.evaluate(() =>
      document
        .getElementById('next')!
        .setAttribute('href', '/shelf/2?delay=150'),
    )
    await page.click('#next')
    await page.waitForSelector('text=game 2')
    expect(requests.filter((r) => r.startsWith('/shelf/2'))).toHaveLength(2)
  })

  test('a POST cut short still drops the cache: the server may have taken it', async () => {
    await open('/shelf/1')
    await page.hover('#hover')
    await page.waitForTimeout(100)
    requests.length = 0
    await page.click('#slow-post-go')
    await page.click('#next') // the same target: the POST is cancelled
    await page.waitForSelector('text=game 2')
    expect(requests).toEqual(['/shelf/2?_segment=shelf,counter'])
  })

  test('a POST drops the cache: what was prefetched before is fetched again', async () => {
    await open('/shelf/1')
    requests.length = 0
    await page.hover('#hover')
    await page.waitForTimeout(100)
    expect(requests).toEqual(['/shelf/2?_segment=shelf,counter'])
    await page.click('#post-go')
    await page.waitForSelector('text=game 9')
    await page.evaluate(() =>
      document.getElementById('next')!.setAttribute('href', '/shelf/2'),
    )
    await page.click('#next')
    await page.waitForSelector('text=game 2')
    expect(requests.filter((r) => r.startsWith('/shelf/2'))).toHaveLength(2)
  })

  test('a POST form follows the 303 and history gets the final URL', async () => {
    await open('/shelf/1')
    await page.evaluate(() =>
      document
        .getElementById('post')!
        .setAttribute('data-bridge-history', 'push'),
    )
    await page.click('#post-go')
    await page.waitForSelector('text=game 9')
    expect(page.url()).toBe(url('/shelf/9'))
    expect(await sameDocument()).toBe(true)
  })

  test('a submit button with formtarget="_blank" is left to the browser', async () => {
    await open('/shelf/1')
    const popup = page.waitForEvent('popup')
    await page.click('#blank-go')
    await (await popup).close()
    expect(await sameDocument()).toBe(true)
    expect(await text('[data-bridge-segment="shelf"] li')).toBe('game 1')
  })

  test('a dialog form is left to the browser: it closes the dialog, nothing is sent', async () => {
    await open('/shelf/1')
    requests.length = 0
    await page.evaluate(() =>
      (document.getElementById('dialog') as HTMLDialogElement).show(),
    )
    await page.click('#dialog-close')
    await page.waitForFunction(
      () => !(document.getElementById('dialog') as HTMLDialogElement).open,
    )
    expect(requests).toEqual([])
    expect(await log()).toEqual([])
  })
})

describe.if(chrome)('twins, swap modes and loading state', () => {
  test('a twin refreshes with every response that carries it', async () => {
    await open('/shelf/1')
    await page.click('#next')
    await page.waitForSelector('text=game 2')
    expect(await text('[data-bridge-segment="counter"]')).toBe('2 games')
  })

  test('a twin inside the target comes with it', async () => {
    await open('/shelf/1?nested')
    requests.length = 0
    await page.click('#next')
    await page.waitForSelector('text=game 2')
    expect(await text('[data-bridge-segment="inner"]')).toBe('inner 2')
    expect(requests).toEqual(['/shelf/2?nested&_segment=shelf,counter,inner'])
    expect(await log()).toEqual([
      'bridge:fetch',
      'bridge:swap',
      'bridge:swapped',
      'bridge:swapped',
    ])
  })

  test('append and prepend keep the old content', async () => {
    await open('/shelf/1')
    const items = () =>
      page.$$eval('[data-bridge-segment="shelf"] li', (l) =>
        l.map((e) => e.textContent),
      )
    await page.locator('#append').first().click()
    await page.waitForFunction(
      () => document.querySelectorAll('li').length === 2,
    )
    expect(await items()).toEqual(['game 1', 'game 2'])
    // the appended copy of the link: it points at shelf 3
    await page.locator('a[data-bridge-swap="prepend"]').last().click()
    await page.waitForFunction(
      () => document.querySelectorAll('li').length === 3,
    )
    expect(await items()).toEqual(['game 3', 'game 1', 'game 2'])
  })

  test('while loading: aria-busy on the targets and the busy segment, active on the trigger', async () => {
    await open('/shelf/1')
    await page.click('#slow')
    await page.waitForSelector(
      '[data-bridge-segment="shelf"][aria-busy="true"]',
    )
    expect(
      await page.getAttribute('[data-bridge-segment="counter"]', 'aria-busy'),
    ).toBe('true')
    expect(await page.getAttribute('#slow', 'data-active')).toBe('')
    await page.waitForSelector('text=game 2')
    expect(await page.$('[aria-busy]')).toBeNull()
  })

  test('a response arriving for a cancelled request is not swapped in', async () => {
    await open('/shelf/1')
    await page.hover('#hover-slow') // prefetch of /shelf/2?delay=150 on its way
    await page.click('#hover-slow') // joins it: not abortable
    await page.evaluate(() =>
      document.getElementById('next')!.setAttribute('href', '/shelf/3'),
    )
    await page.click('#next') // cancels the first; fast
    await page.waitForSelector('text=game 3')
    await page.waitForTimeout(250) // the joined response has arrived by now
    expect(await text('[data-bridge-segment="shelf"] li')).toBe('game 3')
  })

  test('a segment asked for after a whole page cancels it: the later click wins', async () => {
    await open('/shelf/1')
    await page.click('#top-slow')
    await page.click('#next')
    await page.waitForSelector('text=game 2')
    await page.waitForTimeout(500)
    expect(await text('#title')).toBe('Shelf 1')
    expect(await log()).toEqual([
      'bridge:fetch',
      'bridge:fetch',
      'bridge:cancel',
      'bridge:swap',
      'bridge:swapped',
      'bridge:swapped',
    ])
  })

  test('a second request to the same target cancels the first', async () => {
    await open('/shelf/1')
    await page.click('#slow')
    await page.click('#slow2')
    await page.waitForSelector('text=game 3')
    await page.waitForTimeout(350)
    expect(await text('[data-bridge-segment="shelf"] li')).toBe('game 3')
    expect(await page.$('[aria-busy]')).toBeNull()
  })
})

describe.if(chrome)('from a script: visit, reload, prefetch', () => {
  /** The exports of the script the page loads, by the package name the import map gives it. */
  const api = `import('@nexoamigos/nexo/bridge/client')`
  const call = (code: string) =>
    page.evaluate(`${api}.then((bridge) => ${code})`) as Promise<unknown>

  test("visit swaps a segment with the attributes' words, and resolves once it is in", async () => {
    await open('/shelf/1')
    await call(
      `bridge.visit('/shelf/5', { target: 'shelf', history: 'push', scroll: 'target' })`,
    )
    expect(await text('[data-bridge-segment="shelf"] li')).toBe('game 5')
    expect(page.url()).toBe(url('/shelf/5'))
    expect(await sameDocument()).toBe(true)
    // bridge:swapped on the shelf and on the counter, its twin
    expect(await log()).toEqual([
      'bridge:fetch',
      'bridge:swap',
      'bridge:swapped',
      'bridge:swapped',
    ])
  })

  test("without a target, the whole page; from an element, that element's segment", async () => {
    await open('/shelf/1')
    await call(
      `bridge.visit('/shelf/2', { from: document.getElementById('next') })`,
    )
    expect(await text('[data-bridge-segment="shelf"] li')).toBe('game 2')
    expect(await sameDocument()).toBe(true)
    await call(`bridge.visit('/shelf/3')`)
    expect(await text('#title')).toBe('Shelf 3')
    expect(page.url()).toBe(url('/shelf/3'))
    expect(await sameDocument()).toBe(true)
  })

  test('a visit takes a signal: aborting it cancels the visit (the { signal } rule)', async () => {
    await open('/shelf/1')
    const outcome = await call(`(() => {
      const stop = new AbortController()
      const visiting = bridge.visit('/shelf/7?delay=300', { target: 'shelf', signal: stop.signal })
      setTimeout(() => stop.abort(), 50)
      return visiting.then(() => 'swapped', (error) => error.message)
    })()`)
    expect(outcome).toContain('was cancelled')
    expect(await text('[data-bridge-segment="shelf"] li')).toBe('game 1')
  })

  test('a wrong option in a script throws (JS throws, markup reports)', async () => {
    await open('/shelf/1')
    const message = await call(
      `bridge.visit('/shelf/2', { history: 'pushh' }).then(() => 'went', (error) => error.message)`,
    )
    expect(message).toBe(
      'bridge: history "pushh" is not one of push, replace, none',
    )
  })

  test("reload brings this page's segments again", async () => {
    await open('/shelf/1')
    requests.length = 0
    await call(`bridge.reload('counter')`)
    expect(requests).toEqual(['/shelf/1?_segment=counter'])
  })

  test('a visit the page cancelled, or one a later request took over, rejects', async () => {
    await open('/shelf/1')
    await page.evaluate(() =>
      document.addEventListener('bridge:fetch', (e) => e.preventDefault(), {
        once: true,
      }),
    )
    const cancelled = await call(
      `bridge.visit('/shelf/2', { target: 'shelf' }).catch((e) => e.message)`,
    )
    expect(cancelled).toBe(
      `bridge: the visit to ${url('/shelf/2')} was cancelled`,
    )
    const slow = call(
      `bridge.visit('/shelf/2?delay=300', { target: 'shelf' }).catch((e) => e.message)`,
    )
    await page.waitForTimeout(50)
    await call(`bridge.visit('/shelf/3', { target: 'shelf' })`)
    expect(await slow).toBe(
      `bridge: the visit to ${url('/shelf/2?delay=300')} was cancelled`,
    )
    expect(await text('[data-bridge-segment="shelf"] li')).toBe('game 3')
  })

  test('a visit that lands as the whole page still resolves: the page is there', async () => {
    await open('/shelf/1')
    await call(`bridge.visit('/no-shelf', { target: 'shelf' })`)
    expect(await text('p')).toBe('no segments here')
    expect(await sameDocument()).toBe(true)
  })

  test('prefetch brings the page the visit then reuses', async () => {
    await open('/shelf/1')
    requests.length = 0
    await call(`bridge.prefetch('/shelf/2', { target: 'shelf' })`)
    expect(requests).toEqual(['/shelf/2?_segment=shelf,counter'])
    await call(`bridge.visit('/shelf/2', { target: 'shelf' })`)
    expect(requests).toEqual(['/shelf/2?_segment=shelf,counter'])
  })

  test('_none is no target', async () => {
    await open('/shelf/1')
    const message = await call(
      `bridge.visit('/shelf/2', { target: '_none' }).catch((e) => e.message)`,
    )
    expect(message).toBe(
      "bridge: a visit needs a target: segment names or '_top', not '_none'",
    )
  })
})

describe.if(chrome)('lazy content, markers and prefetch', () => {
  test('a segment with data-bridge-src and load="eager" fills itself', async () => {
    await open('/shelf/1?lazy')
    await page.waitForSelector('text=side loaded')
    expect(requests).toContain('/side?_segment=side,counter')
  })

  test('a link with load="viewport" is followed when it comes into view', async () => {
    await open('/shelf/1?lazy')
    expect(await text('[data-bridge-segment="shelf"] li')).toBe('game 1')
    await page.evaluate(() => document.getElementById('more')!.scrollIntoView())
    await page.waitForFunction(
      () => document.querySelectorAll('li').length === 2,
    )
    expect(await sameDocument()).toBe(true)
  })

  test('a segment that renders itself with its own src loads once', async () => {
    requests.length = 0
    await open('/shelf/1?lazy')
    await page.waitForSelector('text=self 99')
    await page.waitForTimeout(300)
    expect(requests.filter((r) => r.startsWith('/self'))).toEqual([
      '/self?_segment=self,counter',
    ])
  })

  test('links inside a self-loading segment are not followed by its load="eager"', async () => {
    requests.length = 0
    await open('/shelf/1?lazy')
    await page.waitForSelector('text=side loaded')
    await page.waitForTimeout(300)
    expect(requests.filter((r) => r.startsWith('/shelf/50'))).toEqual([])
    expect(await text('[data-bridge-segment="side"]')).toContain('side loaded')
  })

  test('lazy content yields to a request the visitor already made on its target', async () => {
    await open('/shelf/1?lazy')
    await page.evaluate(() => {
      document.getElementById('slow')!.click() // the shelf, in 300 ms
      document.getElementById('more')!.scrollIntoView() // append to the shelf, on sight
    })
    await page.waitForSelector('text=game 2')
    await page.waitForTimeout(300)
    expect(await log()).not.toContain('bridge:cancel')
    const items = await page.$$eval('li', (es) => es.map((e) => e.textContent))
    expect(items).toEqual(['game 2'])
  })

  test('a lazy link a click would leave to the browser is not followed', async () => {
    let away = 0
    await page.route('**/example.invalid/**', (route) => {
      away++
      return route.abort()
    })
    await open('/shelf/1?lazy')
    await page.waitForSelector('text=side loaded')
    await page.waitForTimeout(200)
    await page.unrouteAll()
    expect(away).toBe(0)
  })

  test('lazy content that fails stays put, and is asked for again on sight', async () => {
    await open('/shelf/1?lazy')
    await page.route(
      (u) => u.pathname === '/flaky',
      (route) => route.abort(),
    )
    const flaky = page.locator('[data-bridge-segment="flaky"]')
    await flaky.scrollIntoViewIfNeeded()
    await page.waitForFunction(() =>
      (window as unknown as { log: string[] }).log.includes('bridge:fail'),
    )
    expect(await flaky.textContent()).toBe('waiting')
    expect(page.url()).toBe(url('/shelf/1?lazy'))
    expect(await sameDocument()).toBe(true)
    await page.unrouteAll()
    await page.evaluate(() => scrollTo(0, 0))
    await page.waitForTimeout(100)
    await flaky.scrollIntoViewIfNeeded()
    await page.waitForSelector('text=flaky loaded')
  })

  test('the topmost visible hex marker gives the URL', async () => {
    await open('/shelf/1?lazy')
    const markers = page.locator('[data-bridge-hex]')
    await markers.nth(1).scrollIntoViewIfNeeded()
    await page.waitForFunction(() => location.pathname === '/shelf/5', null, {
      polling: 50,
    })
    expect(await sameDocument()).toBe(true)
    await markers.nth(0).scrollIntoViewIfNeeded()
    await page.waitForFunction(() => location.pathname === '/shelf/1', null, {
      polling: 50,
    })
  })

  test('prefetch="hover" brings the page into the cache; the click reuses it', async () => {
    await open('/shelf/1')
    requests.length = 0
    await page.hover('#hover')
    await page.waitForFunction(() => true)
    await page.waitForTimeout(100)
    expect(requests).toEqual(['/shelf/2?_segment=shelf,counter'])
    await page.click('#hover')
    await page.waitForSelector('text=game 2')
    expect(requests).toEqual(['/shelf/2?_segment=shelf,counter'])
  })

  test('a link brings its page once: hovering again a page that could not be kept asks nothing', async () => {
    await open('/shelf/1')
    requests.length = 0
    await page.hover('#hover-nostore')
    await page.waitForTimeout(100)
    await page.hover('#title')
    await page.hover('#hover-nostore')
    await page.waitForTimeout(100)
    expect(requests).toEqual(['/shelf/2?nostore&_segment=shelf,counter'])
  })

  test('a prefetch on its way is not started again; the click joins it', async () => {
    await open('/shelf/1')
    requests.length = 0
    await page.focus('#hover-slow')
    await page.hover('#hover-slow')
    await page.click('#hover-slow')
    await page.waitForSelector('text=game 2')
    const slow = requests.filter((r) => r.startsWith('/shelf/2?delay=150'))
    expect(slow).toEqual(['/shelf/2?delay=150&_segment=shelf,counter'])
  })

  test('a hover waits a moment: a cursor passing through brings nothing', async () => {
    await open('/shelf/1')
    requests.length = 0
    await page.hover('#hover')
    await page.hover('#title') // gone before 80 ms
    await page.waitForTimeout(200)
    expect(requests).toEqual([])
    await page.hover('#hover')
    await page.waitForTimeout(200)
    expect(requests).toEqual(['/shelf/2?_segment=shelf,counter'])
  })

  test('data-bridge-prefetch-delay sets the wait', async () => {
    await open('/shelf/1')
    requests.length = 0
    await page.hover('#hover-later')
    await page.waitForTimeout(150)
    expect(requests).toEqual([])
    await page.waitForTimeout(300)
    expect(requests).toEqual(['/shelf/31?_segment=shelf,counter'])
  })

  test('a visitor saving data gets nothing ahead of a click', async () => {
    await open('/shelf/1')
    await page.evaluate(() =>
      Object.defineProperty(navigator, 'connection', {
        value: { saveData: true },
        configurable: true,
      }),
    )
    requests.length = 0
    await page.hover('#hover')
    await page.waitForTimeout(200)
    expect(requests).toEqual([])
    await page.click('#hover')
    await page.waitForSelector('text=game 2')
    expect(requests).toEqual(['/shelf/2?_segment=shelf,counter'])
  })

  test('a link a click would leave to the browser is not prefetched', async () => {
    await open('/shelf/1')
    let away = 0
    await page.route('**/example.invalid/**', (route) => {
      away++
      return route.abort()
    })
    requests.length = 0
    await page.hover('#hover-away')
    await page.hover('#hover-download')
    await page.waitForTimeout(100)
    await page.unrouteAll()
    expect(away).toBe(0)
    expect(requests).toEqual([])
  })

  test('after a change dropped the cache, hovering brings the page again', async () => {
    await open('/shelf/1')
    await page.hover('#hover')
    await page.waitForTimeout(100)
    await page.click('#ping-go')
    await page.waitForSelector('text=pinged')
    requests.length = 0
    await page.hover('#title')
    await page.hover('#hover')
    await page.waitForTimeout(100)
    expect(requests).toEqual(['/shelf/2?_segment=shelf,counter'])
  })

  test('a link left to the browser gets Speculation Rules instead', async () => {
    await open('/shelf/1')
    const rules = await page.textContent('script[type="speculationrules"]')
    expect(JSON.parse(rules!)).toEqual({
      prefetch: [
        {
          source: 'list',
          urls: [url('/shelf/21'), url('/shelf/9')],
          eagerness: 'moderate',
        },
      ],
    })
  })

  test('rules found later go in a fresh script: browsers read a rule set once', async () => {
    await open('/shelf/1')
    const script = 'script[data-bridge-rules]'
    await page.evaluate(
      (s) => document.querySelector(s)!.setAttribute('data-first', ''),
      script,
    )
    await page.click('#next')
    await page.waitForSelector('text=game 2')
    const rules = JSON.parse((await page.textContent(script))!)
    expect(rules.prefetch[0].urls).toContain(url('/shelf/22'))
    expect(await page.$(`${script}[data-first]`)).toBeNull()
  })
})

describe.if(chrome)('the whole page (_top)', () => {
  test('swaps head and body in place, pushes history, runs no script', async () => {
    await open('/top/1')
    await page.click('#next')
    await page.waitForSelector('text=Top 2')
    expect(await sameDocument()).toBe(true)
    expect(await page.title()).toBe('Top 2')
    expect(page.url()).toBe(url('/top/2'))
    expect(await page.getAttribute('html', 'lang')).toBe('l2')
    expect(await page.getAttribute('meta[name="page"]', 'content')).toBe('2')
    expect(await page.$('#style-1')).toBeNull()
    expect(await page.$('#style-2')).not.toBeNull()
    expect(
      await page.$$eval('script[src="/_nexo/bridge.js"]', (s) => s.length),
    ).toBe(1)
    expect(
      await page.evaluate(() => (window as unknown as { ran: number }).ran),
    ).toBe(1)
  })

  test('a new stylesheet is in and loaded before the swap; the old one goes', async () => {
    await open('/top/1')
    await page.click('#next')
    await page.waitForSelector('text=Top 2')
    expect(await page.$('link[href="/pages/1"]')).toBeNull()
    expect(await page.$('link[href="/pages/2"]')).not.toBeNull()
    const color = () =>
      page.evaluate(
        () => getComputedStyle(document.getElementById('title')!).color,
      )
    expect(await color()).toBe('rgb(2, 0, 0)')
  })

  test('a whole page cancelled while its stylesheet loads never swaps in', async () => {
    await open('/top/1')
    let held = true
    await page.route(
      (u) => u.pathname === '/pages/2',
      async (route) => {
        if (held) await new Promise((done) => setTimeout(done, 400))
        held = false
        await route.continue()
      },
    )
    await page.click('#next') // waits for /pages/2
    await page.waitForTimeout(50)
    await page.click('#replace') // /top/2 too; its sheet is already in the head
    await page.waitForSelector('h1:has-text("Top 2")')
    await page.waitForTimeout(600)
    await page.unrouteAll()
    expect(await log()).toEqual([
      'bridge:fetch',
      'bridge:swap',
      'bridge:fetch',
      'bridge:cancel',
      'bridge:swap',
      'bridge:swapped',
    ])
  })

  test('a newer whole page arriving after a click on a segment leaves the click alone', async () => {
    await open('/top/1')
    version = 1
    await page.click('#etag')
    await page.waitForSelector('text=v1')
    await page.goBack()
    await page.waitForSelector('h1:has-text("Top 1")')
    version = 2
    await page.goForward() // stale v1 at once; the revalidation takes 200 ms
    await page.waitForSelector('text=v1')
    await page.click('#note-link')
    await page.waitForSelector('text=note 3')
    await page.waitForTimeout(400)
    expect(await text('[data-bridge-segment="note"]')).toContain('note 3')
    expect(await text('#version')).toBe('v1')
  })

  test('a new page starts its own speculation rules: the old links are gone', async () => {
    await open('/top/1')
    await page.click('#next')
    await page.waitForSelector('h1:has-text("Top 2")')
    const rules = await page.textContent('script[type="speculationrules"]')
    expect(JSON.parse(rules!).prefetch[0].urls).toEqual([url('/top/12')])
  })

  test('a page cancelled while its stylesheet loads leaves no stylesheet behind', async () => {
    await open('/top/1')
    let held = true
    await page.route(
      (u) => u.pathname === '/pages/2',
      async (route) => {
        if (held) await new Promise((done) => setTimeout(done, 400))
        held = false
        await route.continue()
      },
    )
    await page.click('#next') // waits for /pages/2
    await page.waitForTimeout(50)
    await page.click('#note-link') // a segment: the whole page is cancelled
    await page.waitForSelector('text=note 2')
    await page.waitForTimeout(600)
    await page.unrouteAll()
    expect(await page.$('link[href$="/pages/2"]')).toBeNull()
    expect(await text('#title')).toBe('Top 1')
  })

  test('a segment filling itself under a _top page keeps the scroll', async () => {
    await open('/top/1?lazy')
    await page.evaluate(() => scrollTo(0, document.body.scrollHeight))
    await page.waitForSelector('text=footer loaded')
    await page.waitForTimeout(100)
    expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0)
  })

  test('prefetch="hover" on a whole-page link brings it into the cache', async () => {
    await open('/top/1')
    requests.length = 0
    await page.hover('#hover')
    await page.waitForTimeout(100)
    expect(requests).toEqual(['/top/2'])
    await page.click('#hover')
    await page.waitForSelector('h1:has-text("Top 2")')
    expect(requests).toEqual(['/top/2'])
  })

  test('back brings the previous page back, same document', async () => {
    await open('/top/1')
    await page.click('#next')
    await page.waitForSelector('text=Top 2')
    await page.goBack()
    await page.waitForSelector('text=Top 1')
    expect(await sameDocument()).toBe(true)
    expect(await page.title()).toBe('Top 1')
  })

  test('replace rewrites the entry', async () => {
    await open('/top/1')
    await page.click('#replace')
    await page.waitForSelector('text=Top 2')
    await page.goBack()
    await page.waitForURL((u) => u.pathname !== '/top/1')
  })

  test('a tracked asset that changed means a real navigation', async () => {
    await open('/top/1')
    await page.click('#other-theme')
    await page.waitForSelector('text=Top 2')
    expect(await sameDocument()).toBe(false)
  })

  test('a return to a page whose tracked asset changed rewrites the entry; forward stays', async () => {
    await open('/top/1')
    await page.click('#next')
    await page.waitForSelector('text=Top 2')
    topTheme = 'dark' // a deploy while the visitor was away
    await page.goBack()
    await page.waitForSelector('text=Top 1')
    topTheme = 'light'
    expect(await sameDocument()).toBe(false)
    await page.goForward()
    await page.waitForSelector('text=Top 2')
  })

  test('_none inside a _top page still leaves the link to the browser', async () => {
    await open('/top/1')
    await page.click('#none')
    await page.waitForSelector('text=Top 2')
    expect(await sameDocument()).toBe(false)
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

  test('a swap handed over and applied later goes into the segment as it is then', async () => {
    await open('/shelf/1?nested')
    await page.evaluate(() => {
      const w = window as unknown as { held?: () => Element[] }
      const hold = (event: Event) => {
        event.preventDefault()
        w.held = (event as CustomEvent<{ swap: () => Element[] }>).detail.swap
      }
      document.addEventListener('bridge:swap', hold, { once: true })
    })
    await page.click('#inner-link') // inner 6, held back by the page
    await page.waitForFunction(() => 'held' in window)
    await page.click('#next') // the whole shelf, a new inner 2 inside
    await page.waitForSelector('text=game 2')
    await page.evaluate(() =>
      (window as unknown as { held: () => void }).held(),
    )
    expect(await text('[data-bridge-segment="inner"]')).toBe('inner 6')
  })

  test('a live change: <html> says the direction meanwhile, bridge:transition says it all', async () => {
    await open('/shelf/1')
    await page.evaluate(() => {
      const w = window as any
      document.addEventListener('bridge:transition', (event) => {
        const { direction, types, transition } = (event as CustomEvent).detail
        w.seen = {
          direction,
          types,
          transition,
          marked: document.documentElement.getAttribute(
            'data-bridge-direction',
          ),
        }
      })
    })
    await page.click('#next')
    await page.waitForSelector('text=game 2')
    const seen = await page.evaluate(() => (window as any).seen)
    expect(seen).toEqual({
      direction: 'forward',
      types: [],
      transition: null,
      marked: 'forward',
    })
    await page.waitForFunction(
      () => !document.documentElement.hasAttribute('data-bridge-direction'),
    )
  })

  test('a return through history goes back', async () => {
    await open('/shelf/1')
    await page.click('#push')
    await page.waitForSelector('text=game 2')
    await page.evaluate(() => {
      document.addEventListener(
        'bridge:transition',
        (event) =>
          ((window as any).direction = (event as CustomEvent).detail.direction),
      )
    })
    await page.goBack()
    await page.waitForSelector('text=game 1')
    expect(await page.evaluate(() => (window as any).direction)).toBe('back')
  })

  test('a live leave is marked and its CSS animation awaited before the swap', async () => {
    await open('/shelf/1')
    await page.addStyleTag({
      content:
        '@keyframes out { to { opacity: 0 } } [data-exiting] { animation: out 400ms }',
    })
    await page.click('#next')
    await page.waitForTimeout(150)
    const leaving = await page.evaluate(() => {
      const shelf = document.querySelector('[data-bridge-segment="shelf"]')!
      return {
        text: shelf.textContent!.includes('game 1'),
        marked: shelf.hasAttribute('data-exiting'),
        inert: (shelf as HTMLElement).inert,
      }
    })
    expect(leaving).toEqual({ text: true, marked: true, inert: true })
    await page.waitForSelector('text=game 2')
  })

  test('snapshots carry the direction and the declared types as View Transition types', async () => {
    await open('/shelf/1?transition=zoom')
    await page.evaluate(() => {
      const w = window as any
      document.startViewTransition = ((arg: any) => {
        w.types = arg.types
        arg.update()
        const done = Promise.resolve()
        return {
          updateCallbackDone: done,
          finished: done,
          ready: done,
        } as ViewTransition
      }) as typeof document.startViewTransition
    })
    await page.click('#next')
    await page.waitForSelector('text=game 2')
    expect(await page.evaluate(() => (window as any).types)).toEqual([
      'forward',
      'zoom',
    ])
  })

  test('snapshots run at the page speed (--theater-speed on <html>)', async () => {
    await open('/shelf/1?transition=zoom')
    await page.evaluate(() =>
      document.documentElement.style.setProperty('--theater-speed', '0.5'),
    )
    await page.click('#next')
    const rate = await page.waitForFunction(
      () => {
        const parts = document
          .getAnimations()
          .filter((a) =>
            (a.effect as KeyframeEffect).pseudoElement?.startsWith(
              '::view-transition',
            ),
          )
        return parts.length > 0 ? parts[0]!.playbackRate : null
      },
      undefined,
      { timeout: 10_000 },
    )
    expect(await rate.jsonValue()).toBe(0.5)
  })

  test('data-bridge-transition wraps the swap in a view transition', async () => {
    await open('/shelf/1?transition=true')
    await page.evaluate(() => {
      const w = window as unknown as { transitions: number }
      w.transitions = 0
      document.startViewTransition = ((arg: any) => {
        w.transitions++
        const update = typeof arg === 'function' ? arg : arg.update // with types where the browser has them
        update()
        const done = Promise.resolve()
        return {
          updateCallbackDone: done,
          finished: done,
          ready: done,
        } as ViewTransition
      }) as typeof document.startViewTransition
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

describe.if(chrome)('changes cut short, and other edges', () => {
  const api = `import('@nexoamigos/nexo/bridge/client')`
  const call = (code: string) =>
    page.evaluate(`${api}.then((bridge) => ${code})`) as Promise<unknown>
  const exitOf = (ms: number) =>
    page.addStyleTag({
      content: `@keyframes out { to { opacity: 0 } } [data-exiting] { animation: out ${ms}ms }`,
    })
  const shelfState = () =>
    page.evaluate(() => {
      const shelf = document.querySelector('[data-bridge-segment="shelf"]')!
      return {
        exiting: shelf.hasAttribute('data-exiting'),
        inert: (shelf as HTMLElement).inert,
      }
    })

  test('an endless animation in the leaving segment (a busy spinner) does not hold the swap', async () => {
    await open('/shelf/1')
    await page.addStyleTag({
      content:
        '@keyframes spin { to { rotate: 1turn } } [aria-busy=true]::after { content: ""; display: block; animation: spin 1s infinite }',
    })
    const started = Date.now()
    await page.click('#next')
    await page.waitForSelector('text=game 2')
    expect(Date.now() - started).toBeLessThan(2000) // the fallback is 4 s
  })

  test('a live leave already has the direction on <html>, and bridge:transition came before it', async () => {
    await open('/shelf/1')
    await exitOf(200)
    await page.evaluate(() => {
      const w = window as any
      document.addEventListener('bridge:transition', () => (w.announced = true))
      document.addEventListener('bridge:leave', () => {
        w.during = {
          direction: document.documentElement.getAttribute(
            'data-bridge-direction',
          ),
          announced: w.announced === true,
        }
      })
    })
    await page.click('#next')
    await page.waitForSelector('text=game 2')
    expect(await page.evaluate(() => (window as any).during)).toEqual({
      direction: 'forward',
      announced: true,
    })
  })

  test('a swap that throws leaves no direction on <html>', async () => {
    await open('/shelf/1')
    await page.evaluate(() => {
      const original = Element.prototype.replaceWith
      Element.prototype.replaceWith = function () {
        Element.prototype.replaceWith = original
        throw new Error('swap broke')
      }
      document.addEventListener('bridge:fail', (e) => e.preventDefault())
    })
    await page.click('#next')
    await page.waitForTimeout(300)
    expect(
      await page.evaluate(() =>
        document.documentElement.hasAttribute('data-bridge-direction'),
      ),
    ).toBe(false)
  })

  test('after a visit ends, aborting its signal cancels nothing', async () => {
    await open('/shelf/1')
    await call(`(() => {
      window.stop1 = new AbortController()
      return bridge.visit('/shelf/2', { target: 'shelf', signal: window.stop1.signal })
    })()`)
    await page.evaluate(() => (window as any).stop1.abort())
    expect(await log()).not.toContain('bridge:cancel')
  })

  test('a visit whose signal is already aborted starts nothing, and cancels nothing running', async () => {
    await open('/shelf/1')
    await page.click('#slow') // /shelf/2?delay=300 on the same target
    const outcome = await call(
      `bridge.visit('/shelf/9', { target: 'shelf', signal: AbortSignal.abort() }).catch((e) => e.message)`,
    )
    expect(outcome).toContain('was cancelled')
    await page.waitForSelector('text=game 2')
    expect(await log()).not.toContain('bridge:cancel')
  })

  test('a signal aborted by a bridge:fetch listener cancels the visit', async () => {
    await open('/shelf/1')
    const outcome = await call(`(() => {
      const stop = new AbortController()
      document.addEventListener('bridge:fetch', () => stop.abort(), { once: true })
      return bridge.visit('/shelf/2', { target: 'shelf', signal: stop.signal }).catch((e) => e.message)
    })()`)
    expect(outcome).toContain('was cancelled')
    expect(await page.textContent('body')).not.toContain('game 2')
  })

  test('a visit its bridge:fetch listener aborts cancels nothing already running', async () => {
    await open('/shelf/1')
    await page.click('#slow') // /shelf/2?delay=300 on the same target
    await call(`(() => {
      const stop = new AbortController()
      document.addEventListener('bridge:fetch', () => stop.abort(), { once: true })
      return bridge.visit('/shelf/9', { target: 'shelf', signal: stop.signal }).catch(() => {})
    })()`)
    await page.waitForSelector('text=game 2')
    expect(await log()).not.toContain('bridge:cancel')
  })

  test('a cancelled leave does not bring back what a newer navigation is leaving now', async () => {
    await open('/shelf/1')
    await exitOf(400)
    await page.click('#next') // its leave runs 400 ms
    await page.waitForTimeout(100)
    await page.evaluate(() =>
      document.addEventListener('bridge:leave', (event) =>
        (event as CustomEvent).detail.waitUntil(
          new Promise((done) => setTimeout(done, 600)),
        ),
      ),
    )
    void call(`bridge.visit('/shelf/3', { target: 'shelf' })`) // takes over; its leave runs 600 ms
    await page.waitForTimeout(450) // the first leave has ended, cancelled
    expect(await shelfState()).toEqual({ exiting: true, inert: true })
    await page.waitForSelector('text=game 3')
  })

  test('a visit aborted from bridge:transition leaves the segment as it was', async () => {
    await open('/shelf/1')
    const outcome = await call(`(() => {
      const stop = new AbortController()
      document.addEventListener('bridge:transition', () => stop.abort(), { once: true })
      return bridge.visit('/shelf/2', { target: 'shelf', signal: stop.signal }).catch((e) => e.message)
    })()`)
    expect(outcome).toContain('was cancelled')
    expect(await shelfState()).toEqual({ exiting: false, inert: false })
    expect(await text('[data-bridge-segment="shelf"] li')).toBe('game 1')
  })

  test('a live leave cancelled gives the focus back, and keeps an inert the segment had', async () => {
    await open('/shelf/1')
    await exitOf(300)
    await page.focus('#next')
    const leave = (path: string) =>
      call(`(() => {
        const stop = new AbortController()
        document.addEventListener('bridge:leave', () => setTimeout(() => stop.abort(), 50), { once: true })
        return bridge.visit('${path}', { target: 'shelf', signal: stop.signal }).catch((e) => e.message)
      })()`)
    expect(await leave('/shelf/2')).toContain('was cancelled')
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('next')
    await page.evaluate(() => {
      const shelf = document.querySelector('[data-bridge-segment="shelf"]')
      ;(shelf as HTMLElement).inert = true
    })
    expect(await leave('/shelf/3')).toContain('was cancelled')
    expect(await shelfState()).toEqual({ exiting: false, inert: true })
  })

  test('a wrong value in the markup is reported, not thrown, by a visit or a prefetch', async () => {
    await open('/shelf/1')
    const outcome = await page.evaluate(`(() => {
      document.documentElement.setAttribute('data-bridge-swap', 'morph')
      const reported = []
      addEventListener('error', (e) => { reported.push(e.message); e.preventDefault() })
      return ${api}.then(async (bridge) => {
        bridge.prefetch('/shelf/4', { target: 'shelf' })
        await bridge.visit('/shelf/2', { target: 'shelf' })
        return reported
      })
    })()`)
    expect(new Set(outcome as string[])).toEqual(
      new Set([
        'Uncaught Error: bridge: swap "morph" is not one of replace, append, prepend',
      ]),
    )
    expect(await text('[data-bridge-segment="shelf"] li')).toBe('game 2')
  })

  test('the landing of a visit stops with its signal', async () => {
    await open('/shelf/1')
    await page.route(
      (u) => u.pathname === '/account' && !u.search.includes('_segment'),
      async (route) => {
        await new Promise((done) => setTimeout(done, 300))
        await route.continue().catch(() => {})
      },
    )
    const outcome = await call(`(() => {
      const stop = new AbortController()
      setTimeout(() => stop.abort(), 150)
      return bridge.visit('/account', { target: 'shelf', signal: stop.signal }).catch((e) => e.message)
    })()`)
    await page.waitForTimeout(300)
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    expect(outcome).toContain('was cancelled')
    expect(await page.$('h2:has-text("Account")')).toBeNull()
  })

  test('a finished prefetch lets go of its signal', async () => {
    await open('/shelf/1')
    await call(`(() => {
      window.pageLife = new AbortController()
      return bridge.prefetch('/shelf/4', { target: 'shelf', signal: window.pageLife.signal })
    })()`)
    const cdp = await page.context().newCDPSession(page)
    const { result } = await cdp.send('Runtime.evaluate', {
      expression: 'window.pageLife.signal',
    })
    const { listeners } = await cdp.send('DOMDebugger.getEventListeners', {
      objectId: result.objectId!,
    })
    expect(listeners).toEqual([])
  })

  test('a prefetch whose signal is already aborted asks nothing', async () => {
    await open('/shelf/1')
    requests.length = 0
    await call(
      `bridge.prefetch('/shelf/4', { target: 'shelf', signal: AbortSignal.abort() })`,
    )
    await page.waitForTimeout(100)
    expect(requests).toEqual([])
  })

  test('an entry without an index (written by an older script) does not break back and forward', async () => {
    await open('/shelf/1')
    await page.click('#push')
    await page.waitForSelector('text=game 2')
    await page.evaluate(() => {
      const { index, ...bridge } = history.state.bridge
      history.replaceState({ ...history.state, bridge }, '')
    })
    await page.goBack()
    await page.waitForSelector('text=game 1')
    await page.goForward()
    await page.waitForSelector('text=game 2')
    await page.click('#push')
    await page.waitForSelector('text=game 3')
    await page.evaluate(() =>
      document.addEventListener(
        'bridge:transition',
        (event) =>
          ((window as any).direction = (event as CustomEvent).detail.direction),
      ),
    )
    await page.goBack()
    await page.waitForSelector('text=game 2')
    expect(await page.evaluate(() => (window as any).direction)).toBe('back')
  })

  test('a --theater-speed that is not a speed is reported', async () => {
    await open('/shelf/1?transition=zoom')
    await page.evaluate(() => {
      const w = window as any
      w.reported = []
      addEventListener('error', (e: ErrorEvent) => {
        w.reported.push(e.message)
        e.preventDefault()
      })
      document.documentElement.style.setProperty('--theater-speed', 'fast')
    })
    await page.click('#next')
    await page.waitForSelector('text=game 2')
    await page.waitForFunction(() => (window as any).reported.length > 0)
    expect(await page.evaluate(() => (window as any).reported)).toEqual([
      'Uncaught RangeError: bridge: --theater-speed: fast is not a speed (a positive number); 1 is used',
    ])
  })
})
