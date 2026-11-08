/** How a URL change came: a new entry, the same one replaced, back/forward, or a reload. */
export type Arrival = 'push' | 'replace' | 'traverse' | 'reload'

/**
 * Where the client router's URL comes from (E.1): the app picks one,
 * visibly, and the router's logic is the same for every one. Each turns
 * scrolling and focus restoration over to Nexo (E.1: one owner).
 */
export interface UrlSource {
  /** The URL now. */
  current(): URL
  /** Go there, as a new entry or replacing this one. */
  go(url: URL, options?: { replace?: boolean }): void
  /** Leave for a URL the router doesn't own: a real navigation (the Navigation API does it by itself). */
  leave?(url: URL): void
  /**
   * Hear every URL change the router may own: `claims(url)` says whether
   * it does (a route matches), `arrived(url, how)` runs when it changed.
   */
  listen(listener: SourceListener, signal: AbortSignal): void
}

export interface SourceListener {
  claims(url: URL): boolean
  arrived(url: URL, how: Arrival): unknown
}

/**
 * The Navigation API (museum, Android): every navigation the router claims
 * is intercepted, with scroll and focus left to Nexo. Baseline 2026; on
 * non-HTTP schemes (`tauri://`) WebKit only intercepts `#…` changes (E.1).
 */
export function navigationUrl(): UrlSource {
  const nav = (globalThis as any).navigation
  if (!nav)
    throw new Error(
      'boat: navigationUrl() needs the Navigation API. Use historyUrl() or hashUrl() where it is missing',
    )
  return new NavigationUrl(nav)
}

class NavigationUrl implements UrlSource {
  constructor(private readonly nav: any) {}

  current(): URL {
    return new URL(this.nav.currentEntry.url)
  }

  go(url: URL, options?: { replace?: boolean }): void {
    const history = options?.replace ? 'replace' : 'push'
    this.nav.navigate(url.href, { history })
  }

  listen(listener: SourceListener, signal: AbortSignal): void {
    const onNavigate = (event: any) => this.navigated(event, listener)
    this.nav.addEventListener('navigate', onNavigate, { signal })
  }

  /** What the router claims is intercepted; the rest the browser keeps. */
  private navigated(event: any, listener: SourceListener): void {
    if (!event.canIntercept || event.downloadRequest || event.formData) return
    if (event.hashChange) return // a jump within the page: the browser scrolls, nothing reloads
    const url = new URL(event.destination.url)
    if (!listener.claims(url)) return
    const how = arrivalOf(event.navigationType)
    const handler = () => listener.arrived(url, how)
    event.intercept({ scroll: 'manual', focusReset: 'manual', handler })
  }
}

function arrivalOf(type: string): Arrival {
  if (type === 'traverse' || type === 'replace' || type === 'reload')
    return type
  return 'push'
}

/** How a `pushState` source writes and reads its address (pattern: strategy). */
interface Address {
  read(href: string): URL
  write(url: URL): string
}

/**
 * The History API: `pushState` for new entries, `popstate` for back and
 * forward, `scrollRestoration = 'manual'` (E.1).
 */
export function historyUrl(): UrlSource {
  return new PushStateUrl({
    read: (href) => new URL(href),
    write: (url) => url.href,
  })
}

/**
 * The hash (`#/book/3`): the route is what follows `#`; works on any scheme,
 * `tauri://` included (Lector on Linux, E.1).
 */
export function hashUrl(): UrlSource {
  return new PushStateUrl({
    read: fromHash,
    write: (url) => `#${url.pathname}${url.search}${url.hash}`,
  })
}

class PushStateUrl implements UrlSource {
  private listener?: SourceListener

  constructor(private readonly address: Address) {}

  current(): URL {
    return this.address.read(location.href)
  }

  leave(url: URL): void {
    location.assign(url.href)
  }

  /** `pushState` fires nothing: the router hears it from here. */
  go(url: URL, options?: { replace?: boolean }): void {
    const href = this.address.write(url)
    if (options?.replace) history.replaceState(null, '', href)
    else history.pushState(null, '', href)
    this.listener?.arrived(url, options?.replace ? 'replace' : 'push')
  }

  listen(listener: SourceListener, signal: AbortSignal): void {
    this.listener = listener
    manualScroll(signal)
    const onPop = () => listener.arrived(this.current(), 'traverse')
    addEventListener('popstate', onPop, { signal })
  }
}

/** `https://app/#/book/3?p=2` → `https://app/book/3?p=2`: the route's own URL. */
function fromHash(href: string): URL {
  const page = new URL(href)
  const route = page.hash.slice(1) || '/'
  const url = new URL(route.startsWith('/') ? route : `/${route}`, page.origin)
  return url.origin === page.origin ? url : new URL('/', page.origin) // `#//other.host/x` is no route
}

function manualScroll(signal: AbortSignal): void {
  const before = history.scrollRestoration
  history.scrollRestoration = 'manual'
  const restore = () => (history.scrollRestoration = before)
  signal.addEventListener('abort', restore, { once: true })
}

/** In memory, for tests and embedded views: a list of entries, nothing in the address bar. */
export function memoryUrl(
  start: string | URL = '/',
): UrlSource & { back(): void; forward(): void } {
  return new MemoryUrl(new URL(start, 'memory://app'))
}

class MemoryUrl implements UrlSource {
  private readonly entries: URL[]
  private at = 0
  private listening?: SourceListener

  constructor(start: URL) {
    this.entries = [start]
  }

  current(): URL {
    return this.entries[this.at]!
  }

  go(url: URL, options?: { replace?: boolean }): void {
    if (options?.replace) this.entries[this.at] = url
    else this.entries.splice(++this.at, Infinity, url)
    this.listening?.arrived(url, options?.replace ? 'replace' : 'push')
  }

  listen(listener: SourceListener, signal: AbortSignal): void {
    this.listening = listener
    signal.addEventListener('abort', () => (this.listening = undefined), {
      once: true,
    })
  }

  back(): void {
    this.move(-1)
  }

  forward(): void {
    this.move(1)
  }

  private move(by: number): void {
    const to = this.at + by
    if (to < 0 || to >= this.entries.length) return
    this.at = to
    this.listening?.arrived(this.current(), 'traverse')
  }
}
