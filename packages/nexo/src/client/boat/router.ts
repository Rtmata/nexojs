import { isNotFound } from '../../shared/http/not-found'
import { claimClicks } from './clicks'
import type {
  ReactiveValue,
  ReadableLike,
  Reactivity,
  ResourceLike,
} from './reactivity'
import type { ClientMatch, FailedContext, PageContext } from './routes'
import { Scroll } from './scroll'
import type { Arrival, UrlSource } from './sources'

export interface BoatClientOptions {
  /** URL → route and params, or `null`: `routes({ … })`, or your own. */
  match: (url: URL) => ClientMatch | null
  /** Where the URL comes from: `navigationUrl()`, `historyUrl()`, `hashUrl()`, `memoryUrl()`. */
  source: UrlSource
  /** The signals library, as a value. */
  reactivity: Reactivity
  /** The router's lifetime: aborting it stops every listener. */
  signal: AbortSignal
}

/** Where the router is: the URL and what matched it. */
interface Place {
  url: URL
  match: ClientMatch | null
}

/**
 * The client router. Its `page` is a hole for omino; the
 * current route's data is a `resource` over the navigation, so the latest
 * one wins and a stale answer is dropped. While a route loads, the page
 * before it stays (bridge's `aria-busy` idea): `data.isLoading` says so.
 */
export class ClientRouter {
  readonly data: ResourceLike<unknown>
  private readonly place: ReactiveValue<Place>
  private readonly shown: ReactiveValue<unknown>
  private readonly scroll = new Scroll()
  private notFoundPage?: (ctx: PageContext) => unknown
  private failedPage?: (ctx: FailedContext) => unknown
  /** The place the resource is loading (or loaded) for: what `show` pairs the data with. */
  private loading?: Place
  /** The last page that wasn't a failure: what shows when a later load fails with no page for it. */
  private lastGood: unknown = null
  private shownGood = false

  constructor(private readonly options: BoatClientOptions) {
    const { reactivity, source, signal } = options
    this.place = reactivity.signal(this.placeOf(source.current()))
    this.shown = reactivity.signal<unknown>(null)
    this.data = reactivity.resource(
      this.place,
      (now, run) => this.load(now as Place, run),
      { signal },
    )
    reactivity.effect(() => this.show(), { signal })
    this.listen()
  }

  /**
   * The current page: a hole, `{router.page}`. Typed `any`: it's whatever
   * your routes' `page` returns (JSX for omino); boat doesn't import it.
   */
  get page(): ReadableLike<any> {
    return this.shown.asReadonly()
  }

  get url(): ReadableLike<URL> {
    return { get: () => this.place.get().url }
  }

  get params(): ReadableLike<Record<string, string>> {
    return { get: () => this.place.get().match?.params ?? {} }
  }

  /**
   * The page for what no route has, and for a `load` that returns
   * `notFound()`. With it the router claims every URL; without it an
   * unmatched one goes on to bridge, then the server.
   */
  notFound(page: (ctx: PageContext) => unknown): this {
    this.notFoundPage = page
    return this
  }

  /**
   * The page for a `load` that throws, when the route has no
   * `failed` of its own: the nearest wins, as SvelteKit's `+error` and React
   * Router's boundaries. It gets `{ error, retry, url, params }`. Without
   * either, the page before stays and the error is reported.
   */
  failed(page: (ctx: FailedContext) => unknown): this {
    this.failedPage = page
    return this
  }

  /**
   * Go there from a script, through the source (bridge's verb too). A URL
   * no route claims leaves the app for real (`source.leave`): the server
   * answers it, as it would a plain link.
   */
  visit(url: string | URL, options?: { replace?: boolean }): void {
    const { source } = this.options
    const target = new URL(url, source.current())
    if (!this.claims(target) && source.leave) return source.leave(target)
    source.go(target, options)
  }

  /** A clicked link: the router's when it claims the URL. */
  private take(url: URL): boolean {
    if (!this.claims(url)) return false
    this.visit(url)
    return true
  }

  claims(url: URL): boolean {
    return this.options.match(url) !== null || this.notFoundPage !== undefined
  }

  private listen(): void {
    const { source, signal } = this.options
    const arrived = (url: URL, how: Arrival) => this.arrive(url, how)
    source.listen({ claims: (url) => this.claims(url), arrived }, { signal })
    claimClicks((url) => this.take(url), signal)
  }

  /** A new place: its data loads; the navigation ends once it settles. */
  private arrive(url: URL, how: Arrival): Promise<void> {
    this.scroll.leaving(this.place.peek().url)
    this.place.set(this.placeOf(url))
    return this.settled().then(() => this.scroll.arrived(url, how))
  }

  private placeOf(url: URL): Place {
    return { url, match: this.options.match(url) }
  }

  /** The route's `load`, called on the route (a route may be a class instance using `this`). */
  private load(place: Place, run: { signal: AbortSignal }): unknown {
    this.loading = place
    const route = place.match?.route
    if (!route?.load) return undefined
    return route.load({
      params: place.match!.params,
      url: place.url,
      signal: run.signal,
    })
  }

  /** Once its data is ready, the place's page; until then, the page before. A failure: its page, if there is one. */
  private show(): void {
    const status = this.data.status.get()
    if (status === 'error') return this.showFailure()
    if (status !== 'ready' && status !== 'local') return
    const value = this.data.value.get()
    const place =
      this.loading ?? this.options.reactivity.untrack(() => this.place.get())
    const page = this.pageOf(place, value)
    this.lastGood = page
    this.shownGood = true
    this.options.reactivity.untrack(() => this.shown.set(page))
  }

  /** The route's `failed`, else the router's; neither: the last good page stays (never a stale failure page), the resource reported it. */
  private showFailure(): void {
    const { untrack } = this.options.reactivity
    const place = this.loading ?? untrack(() => this.place.get())
    const route = place.match?.route
    const page = route?.failed ? route.failed.bind(route) : this.failedPage
    const ctx = { ...this.contextOf(place), error: this.data.error.get() }
    const retry = () => this.data.reload()
    if (!page && !this.shownGood) return // nothing good shown yet: the server's page stays
    const shown = page ? page({ ...ctx, retry }) : this.lastGood
    untrack(() => this.shown.set(shown))
  }

  private contextOf(place: Place): PageContext {
    return { params: place.match?.params ?? {}, url: place.url }
  }

  private pageOf(place: Place, value: unknown): unknown {
    const ctx = this.contextOf(place)
    if (!place.match || isNotFound(value))
      return this.notFoundPage?.(ctx) ?? null
    return place.match.route.page(value, ctx)
  }

  /** Resolves when the data stops loading (the Navigation API waits on it). */
  private settled(): Promise<void> {
    const { effect } = this.options.reactivity
    return new Promise((done) => {
      const stop = effect(() => {
        if (!this.data.isLoading.get()) queueMicrotask(() => (stop(), done()))
      })
    })
  }
}

/**
 * The client router:
 *
 *   const router = boat({ match: routes({ … }), source: navigationUrl(), reactivity: connector, signal })
 *   mount(<Shell>{router.page}</Shell>, document.body, { signal, reactivity: connector })
 */
export function boat(options: BoatClientOptions): ClientRouter {
  return new ClientRouter(options)
}
