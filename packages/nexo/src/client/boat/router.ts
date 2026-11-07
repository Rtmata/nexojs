import { isNotFound } from '../../shared/boat/not-found'
import { claimClicks } from './clicks'
import type {
  ReactiveValue,
  ReadableLike,
  Reactivity,
  ResourceLike,
} from './reactivity'
import type { ClientMatch, PageContext } from './routes'
import { Scroll } from './scroll'
import type { Arrival, UrlSource } from './sources'

export interface BoatClientOptions {
  /** URL → route and params, or `null`: `routes({ … })`, or your own (E.1). */
  match: (url: URL) => ClientMatch | null
  /** Where the URL comes from: `navigationUrl()`, `historyUrl()`, `hashUrl()`, `memoryUrl()`. */
  source: UrlSource
  /** The signals library, as a value (R.20). */
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
 * The client router (E.1, E.2, R.20). Its `page` is a hole for omino; the
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
   * `notFound()` (E.2). With it the router claims every URL; without it an
   * unmatched one goes on to bridge, then the server.
   */
  notFound(page: (ctx: PageContext) => unknown): this {
    this.notFoundPage = page
    return this
  }

  /** Go there from a script, through the source (bridge's verb too). */
  visit(url: string | URL, options?: { replace?: boolean }): void {
    this.options.source.go(new URL(url, this.options.source.current()), options)
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
    source.listen({ claims: (url) => this.claims(url), arrived }, signal)
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

  private load(place: Place, run: { signal: AbortSignal }): unknown {
    const load = place.match?.route.load
    if (!load) return undefined
    return load({
      params: place.match!.params,
      url: place.url,
      signal: run.signal,
    })
  }

  /** Once its data is ready, the place's page; until then, the page before. */
  private show(): void {
    const status = this.data.status.get()
    if (status !== 'ready' && status !== 'local') return
    const value = this.data.value.get()
    const place = this.options.reactivity.untrack(() => this.place.get())
    this.options.reactivity.untrack(() =>
      this.shown.set(this.pageOf(place, value)),
    )
  }

  private pageOf(place: Place, value: unknown): unknown {
    const ctx = { params: place.match?.params ?? {}, url: place.url }
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
