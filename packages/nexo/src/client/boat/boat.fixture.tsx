/**
 * The scenarios of boat.browser.test.ts, bundled and run inside each
 * browser on a real HTTP page (pushState and the Navigation API need one).
 */
import * as connector from '../../shared/connector/index'
import { flush } from '../../shared/connector/index'
import { Component, type Child } from '../../shared/omino/index'
import { mount } from '../omino/index'
import {
  boat,
  hashUrl,
  historyUrl,
  memoryUrl,
  navigationUrl,
  notFound,
  routes,
  type UrlSource,
} from './index'

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms))
const settle = async () => {
  for (let i = 0; i < 5; i++) {
    flush()
    await wait(5)
  }
}

class Shell extends Component<{ busy: { get(): boolean } }> {
  template(): Child {
    return (
      <main aria-busy={() => String(this.props.busy.get())}>
        {this.props.children}
      </main>
    )
  }
}

function table(log: string[], delays: Record<string, number> = {}) {
  return routes({
    '/': { page: () => <h1>shelf</h1> },
    '/book/new': { page: () => <h1>new book</h1> },
    '/book/:id': {
      load: async ({ params, signal }) => {
        log.push(`load ${params.id}`)
        let done = false
        signal.addEventListener(
          'abort',
          () => done || log.push(`aborted ${params.id}`),
        )
        await wait(delays[params.id] ?? 20)
        done = true
        return params.id === '404' ? notFound() : { title: `book ${params.id}` }
      },
      page: (book: { title: string }, { params }) => (
        <h1 data-id={params.id}>{book.title}</h1>
      ),
    },
    '/links': {
      page: () => (
        <nav>
          <a id="to-book" href="/book/3">
            book
          </a>
          <a id="to-server" href="/elsewhere">
            server
          </a>
          <a id="to-new" href="/book/3" target="_blank">
            new window
          </a>
        </nav>
      ),
    },
  })
}

function start(source: UrlSource, log: string[] = [], lost = true) {
  const controller = new AbortController()
  const router = boat({
    match: table(log),
    source,
    reactivity: connector,
    signal: controller.signal,
  })
  if (lost) router.notFound(() => <h1>lost</h1>)
  const host = document.createElement('div')
  document.body.replaceChildren(host)
  mount(<Shell busy={router.data.isLoading}>{router.page}</Shell>, host, {
    signal: controller.signal,
    reactivity: connector,
  })
  const heading = () => host.querySelector('h1')?.textContent ?? null
  return { router, host, heading, controller }
}

export async function memoryRoutes() {
  const log: string[] = []
  const source = memoryUrl('/')
  const { router, heading, host, controller } = start(source, log)
  await settle()
  const first = heading()
  router.visit('/book/2')
  flush()
  await wait(5)
  const busy = host.querySelector('main')!.getAttribute('aria-busy')
  const during = { heading: heading(), busy }
  await wait(40)
  await settle()
  const loaded = heading()
  source.back()
  await settle()
  const back = heading()
  controller.abort()
  return { first, during, loaded, back, log }
}

export async function latestWins() {
  const log: string[] = []
  const controller = new AbortController()
  const match = table(log, { '1': 100 })
  const router = boat({
    match,
    source: memoryUrl('/'),
    reactivity: connector,
    signal: controller.signal,
  })
  router.visit('/book/1')
  await settle()
  router.visit('/book/2')
  await wait(60)
  await settle()
  const status = router.data.status.get()
  const title = (router.data.value.get() as { title: string } | undefined)
    ?.title
  controller.abort()
  return { status, title, log }
}

export async function notFoundCases() {
  const { router, heading, controller } = start(memoryUrl('/'))
  router.visit('/book/404')
  await wait(40)
  await settle()
  const fromLoad = heading()
  router.visit('/nowhere')
  await settle()
  const unmatched = heading()
  controller.abort()
  return { fromLoad, unmatched, claimsWithout: claimsWithout() }
}

function claimsWithout(): boolean {
  const other = new AbortController()
  const source = memoryUrl('/')
  const router = boat({
    match: table([]),
    source,
    reactivity: connector,
    signal: other.signal,
  })
  const claims = router.claims(new URL('/nowhere', location.href))
  other.abort()
  return claims
}

export function specificity() {
  const match = table([])
  const url = (p: string) => new URL(p, location.origin)
  return {
    static: !('id' in match(url('/book/new'))!.params),
    param: match(url('/book/7'))!.params,
    none: match(url('/shelf/1')),
  }
}

/** Where bridge would listen: the bubble phase of document. */
function bubbleLog() {
  const seen: string[] = []
  const listen = (e: MouseEvent) => {
    const link = (e.target as Element).closest('a')
    seen.push(`${link?.id}:${e.defaultPrevented}`)
    e.preventDefault() // the test stays on this page
  }
  document.addEventListener('click', listen)
  return { seen, stop: () => document.removeEventListener('click', listen) }
}

function sourceFor(kind: 'navigation' | 'history' | 'hash'): UrlSource {
  if (kind === 'navigation') return navigationUrl()
  return kind === 'history' ? historyUrl() : hashUrl()
}

export async function clickChain(kind: 'navigation' | 'history' | 'hash') {
  history.replaceState(null, '', kind === 'hash' ? '/#/links' : '/links')
  const { heading, host, controller } = start(sourceFor(kind), [], false)
  await settle()
  const bubble = bubbleLog()
  for (const id of ['to-server', 'to-new', 'to-book'])
    (host.querySelector(`#${id}`) as HTMLElement).click()
  await wait(60)
  await settle()
  bubble.stop()
  const after = {
    seen: bubble.seen,
    heading: heading(),
    path: location.pathname,
    hash: location.hash,
  }
  history.back()
  await wait(80)
  await settle()
  const back = heading()
  controller.abort()
  return { ...after, back }
}

/** A load that throws shows the route's `failed` page, else the router's, with a working retry. */
export async function failing() {
  let attempts = 0
  const match = routes({
    '/': { page: () => <h1>shelf</h1> },
    '/flaky': {
      load: async () => {
        if (++attempts < 2) throw new Error('boom')
        return { ok: true }
      },
      page: () => <h1>flaky ok</h1>,
      failed: ({ error, retry }) => (
        <section>
          <h1>route failed: {(error as Error).message}</h1>
          <button id="retry" onclick={retry}>
            retry
          </button>
        </section>
      ),
    },
    '/broken': {
      load: () => Promise.reject(new Error('down')),
      page: () => <h1>never</h1>,
    },
    '/silent': {
      load: () => Promise.reject(new Error('quiet')),
      page: () => <h1>never</h1>,
    },
  })
  const controller = new AbortController()
  const source = memoryUrl('/')
  const onError = (e: PromiseRejectionEvent | ErrorEvent) => e.preventDefault()
  window.addEventListener('unhandledrejection', onError)
  const router = boat({
    match,
    source,
    reactivity: connector,
    signal: controller.signal,
  })
  const host = document.createElement('div')
  document.body.replaceChildren(host)
  mount(<main>{router.page}</main>, host, {
    signal: controller.signal,
    reactivity: connector,
  })
  const heading = () => host.querySelector('h1')?.textContent ?? null
  await settle()
  router.visit('/flaky')
  await wait(30)
  await settle()
  const routeOwn = heading()
  ;(host.querySelector('#retry') as HTMLButtonElement).click()
  await wait(30)
  await settle()
  const afterRetry = heading()
  router.visit('/silent')
  await wait(30)
  await settle()
  const withoutHook = heading()
  router.failed(({ error }) => (
    <h1>router failed: {(error as Error).message}</h1>
  ))
  router.visit('/broken')
  await wait(30)
  await settle()
  const routerLevel = heading()
  window.removeEventListener('unhandledrejection', onError)
  controller.abort()
  return { routeOwn, afterRetry, withoutHook, routerLevel }
}

/** Review: a hash that points at another host is no route; the route's own #fragment survives. */
export async function hashSafety() {
  history.replaceState(null, '', '/#//evil.com/x')
  const source = hashUrl()
  const foreign = source.current()
  history.replaceState(null, '', '/#/book/3?p=2#reviews')
  const fragment = source.current()
  source.go(new URL('/book/4#notes', location.origin))
  const written = location.hash
  history.replaceState(null, '', '/')
  return {
    foreignHost: foreign.host,
    foreignPath: foreign.pathname,
    fragment: `${fragment.pathname}${fragment.search}${fragment.hash}`,
    written,
  }
}

/** Review: a link inside an inline SVG is not the router's (its href is an SVGAnimatedString). */
export async function svgLink() {
  history.replaceState(null, '', '/links')
  const { host, controller } = start(historyUrl(), [], false)
  await settle()
  host.insertAdjacentHTML(
    'beforeend',
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><a id="svg-link" href="#x"><rect width="20" height="20"/></a></svg>',
  )
  const errors: string[] = []
  const onError = (e: ErrorEvent) => (
    errors.push(e.message),
    e.preventDefault()
  )
  window.addEventListener('error', onError)
  const bubble = bubbleLog()
  ;(host.querySelector('#svg-link') as SVGAElement).dispatchEvent(
    new MouseEvent('click', { bubbles: true, cancelable: true }),
  )
  bubble.stop()
  window.removeEventListener('error', onError)
  controller.abort()
  return { errors, seen: bubble.seen }
}

/** Review: a `#hash` that isn't valid percent-encoding still scrolls (to the top) instead of throwing. */
export async function oddHash() {
  history.replaceState(null, '', '/')
  const { router, controller } = start(historyUrl(), [], false)
  await settle()
  const errors: string[] = []
  const onError = (e: ErrorEvent) => (
    errors.push(e.message),
    e.preventDefault()
  )
  window.addEventListener('error', onError)
  router.visit('/book/2#100%')
  await wait(60)
  await settle()
  await new Promise((done) =>
    requestAnimationFrame(() => requestAnimationFrame(done)),
  )
  window.removeEventListener('error', onError)
  const path = location.pathname
  controller.abort()
  history.replaceState(null, '', '/')
  return { errors, path }
}

/** Round 4: `load` and `failed` keep their receiver; a failure page never outlives its route. */
export async function receiversAndRecovery() {
  class Books {
    readonly titles: Record<string, string> = { '1': 'Dune' }
    async load({ params }: { params: { id: string } }) {
      if (!(params.id in this.titles)) throw new Error('missing')
      return { title: this.titles[params.id] }
    }
    page(book: { title: string }) {
      return <h1>{book.title}</h1>
    }
    failed({ error }: { error: unknown }) {
      return (
        <h1>
          {this.titles['1']} not {(error as Error).message}
        </h1>
      )
    }
  }
  const match = routes({
    '/': { page: () => <h1>shelf</h1> },
    '/book/:id': new Books(),
  })
  const controller = new AbortController()
  const source = memoryUrl('/')
  const router = boat({
    match,
    source,
    reactivity: connector,
    signal: controller.signal,
  })
  const host = document.createElement('div')
  document.body.replaceChildren(host)
  mount(<main>{router.page}</main>, host, {
    signal: controller.signal,
    reactivity: connector,
  })
  const heading = () => host.querySelector('h1')?.textContent ?? null
  const onError = (e: PromiseRejectionEvent) => e.preventDefault()
  window.addEventListener('unhandledrejection', onError)
  await settle()
  router.visit('/book/1')
  await wait(20)
  await settle()
  const loaded = heading()
  router.visit('/book/9')
  await wait(20)
  await settle()
  const failed = heading()
  router.visit('/')
  await wait(20)
  await settle()
  const recovered = heading()
  window.removeEventListener('unhandledrejection', onError)
  controller.abort()
  return { loaded, failed, recovered }
}
