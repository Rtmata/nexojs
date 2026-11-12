/**
 * The browser side of bridge. `start({ signal })` makes it listen for
 * clicks on links and for form submissions; one inside a segment (or
 * pointing at one through `data-bridge-target`) is fetched and only that
 * segment is replaced. Everything else stays with the browser. Read
 * `navigation.ts` for the steps and `events.ts` for what the page can hook.
 * The same from a script: `visit`, `reload` and `prefetch` (see `api.ts`).
 *
 * Importing it does nothing. A page starts bridge once, in one script:
 * the served `/_nexo/bridge.js` (`served.ts`, for pages with no script of
 * their own), or your client entry, which then uses `visit` and
 * `arrivals` from the same bridge.
 */
import { STARTED, TOP } from '../../shared/bridge/vocabulary'
import { Api } from './api'
import { ResponseCache } from './cache'
import type { ReturnDirection } from './change'
import { isPlainNavigation, plainClickOn, type Click } from './click'
import { BrowserFallback, RETURN } from './fallback'
import { isPlainSubmission, submissionOf, wantedFrom } from './forms'
import { HexTrail } from './hex'
import { HistoryKeeper, type Restore } from './history'
import { Inflight } from './inflight'
import { Lazy } from './lazy'
import { arrivals as everyArrival, type Arrival } from './lives'
import { Loader, type Wanted } from './loader'
import { Navigation, type Session } from './navigation'
import { optionsOf, type Options, type VisitOptions } from './options'
import { WholePage } from './page'
import { BySegments } from './segments'
import { swapperFor, type Swapper } from './swapper'
import { Prefetch } from './prefetch'

export type { Arrival, VisitOptions }
export { STARTED }

/** How long a fetched page stays fresh for prefetch, twins and navigations ahead, unless its `Cache-Control` says otherwise. */
const CACHE_TTL = 60_000

/** The bridge this script started, if it did. */
let running: Running | undefined

/**
 * Starts bridge on this page until `signal` aborts (an app never needs to;
 * tests and embeddings do). A second start throws, whichever script it
 * comes from: two bridges would follow every click twice.
 *
 *   start({ signal: new AbortController().signal })
 */
export function start({ signal }: { readonly signal: AbortSignal }): void {
  ensureNotStarted()
  if (signal.aborted) return
  running = new Running(signal)
  signal.addEventListener('abort', () => (running = undefined), { once: true })
}

function ensureNotStarted(): void {
  if (!document.documentElement.hasAttribute(STARTED)) return
  throw new Error(
    `bridge: it already runs on this page (<html ${STARTED}>); start it once: the served /_nexo/bridge.js or your client entry, not both`,
  )
}

export const visit = (url: string | URL, options?: VisitOptions) =>
  started('visit').api.visit(url, options)

export const reload = (
  target: string | readonly string[],
  options?: VisitOptions,
) => started('reload').api.reload(target, options)

export const prefetch = (url: string | URL, options?: VisitOptions) =>
  started('prefetch').api.prefetch(url, options)

/**
 * `fn` for every segment now and for each that arrives, each with its
 * life (see `lives.ts`). The lives are this script's bridge's: one started
 * in another script would end segments this one never hears of.
 *
 *   arrivals((segment, { signal }) => attach(segment, registry, { signal }), { signal })
 */
export function arrivals(fn: Arrival, options: { signal: AbortSignal }): void {
  started('arrivals')
  everyArrival(fn, options)
}

/** The running bridge, or an error that says how to start it here. */
function started(what: string): Running {
  if (running) return running
  throw new Error(
    `bridge: ${what}() needs bridge started in this script: call start({ signal }) in your client entry, and drop /_nexo/bridge.js from the page`,
  )
}

/** What looks at the page as it is and as it changes: lazy content, prefetch, scroll markers. */
interface Watcher {
  /** `from`: the URL the content in `root` just came from. */
  scan(root: ParentNode, from?: URL): void
}

/** One started bridge: its mark, session, watchers and listeners, all ended by one signal. */
class Running {
  readonly api: Api
  private readonly session: Session
  private readonly watchers: Watcher[]

  constructor(private readonly signal: AbortSignal) {
    const restore: Restore = (url, targets, way) =>
      this.restore(url, targets, way)
    this.session = sessionFor(restore, signal)
    this.api = new Api(this.session)
    this.watchers = watchersFor(this.session, signal)
    this.mark()
    this.scan(document)
    this.listen()
  }

  /** `<html data-bridge-started>` while it runs; stopping it also stops the navigations under way. */
  private mark(): void {
    const root = document.documentElement
    root.setAttribute(STARTED, '')
    const stop = () => {
      root.removeAttribute(STARTED)
      this.session.inflight.abortAll()
    }
    this.signal.addEventListener('abort', stop, { once: true })
  }

  private scan(root: ParentNode, from?: URL): void {
    for (const watcher of this.watchers) watcher.scan(root, from)
  }

  /** What arrives is scanned; links and forms are followed when they are bridge's. */
  private listen(): void {
    const options = { signal: this.signal }
    const swapped = (event: Event) =>
      this.swapped(event as CustomEvent<{ url: URL }>)
    document.addEventListener('bridge:swapped', swapped, options)
    document.addEventListener('click', (event) => this.click(event), options)
    document.addEventListener('submit', (event) => this.submit(event), options)
  }

  private swapped(event: CustomEvent<{ url: URL }>): void {
    this.scan(event.target as Element, event.detail.url)
  }

  private click(event: MouseEvent): void {
    const link = linkOf(event)
    if (link)
      this.follow(event, link, link, { url: new URL(link.href), method: 'GET' })
  }

  private submit(event: SubmitEvent): void {
    const submission = submissionOf(event)
    if (!isPlainSubmission(submission)) return
    const form = event.target as HTMLFormElement
    this.follow(event, event.submitter ?? form, form, wantedFrom(submission))
  }

  /**
   * Navigates when the reader's options say so (segments or `_top`); else
   * the browser keeps the event. The reader is where the attributes are
   * read from (the submit button, when there is one); the trigger is what
   * carries the events and the active mark (the form).
   */
  private follow(
    event: Event,
    reader: Element,
    trigger: Element,
    wanted: Omit<Wanted, 'segments'>,
  ): void {
    const options = optionsOf(reader)
    const swapper = swapperFor(options)
    if (!swapper) return
    event.preventDefault()
    const fallback = new BrowserFallback(trigger, wanted)
    void this.navigation(trigger, wanted, swapper, options, fallback).run()
  }

  /** Back/forward: what changed to reach that entry is swapped again (a stale copy will do), nothing recorded; whatever fails rewrites the entry, never adds one. */
  private restore(
    url: URL,
    targets: string[],
    direction: ReturnDirection,
  ): Promise<void> {
    const root = document.documentElement
    const options = { ...restoreOptions(root), direction }
    const wanted = { url, method: 'GET', stale: true }
    const swapper: Swapper = targets.includes(TOP)
      ? new WholePage()
      : new BySegments(targets, options)
    const fallback = new BrowserFallback(root, wanted, RETURN)
    const back = this.navigation(root, wanted, swapper, options, fallback)
    return back.run().then(() => {})
  }

  private navigation(
    ...[trigger, wanted, swapper, options, fallback]: Steps
  ): Navigation {
    return new Navigation(
      trigger,
      wanted,
      swapper,
      options,
      this.session,
      fallback,
    )
  }
}

/** What one navigation is made of, besides the session. */
type Steps = [
  Element,
  Omit<Wanted, 'segments'>,
  Swapper,
  Options,
  BrowserFallback,
]

/** The loader, the requests in flight and the history, shared by every navigation. */
function sessionFor(restore: Restore, signal: AbortSignal): Session {
  return {
    loader: new Loader(new ResponseCache(CACHE_TTL)),
    inflight: new Inflight(),
    history: new HistoryKeeper(restore, signal),
  }
}

function watchersFor(session: Session, signal: AbortSignal): Watcher[] {
  return [
    new Lazy(session, signal),
    new Prefetch(session.loader, signal),
    new HexTrail(session.history, signal),
  ]
}

/** A return records nothing, keeps the scroll it will put back, and moves no focus. */
function restoreOptions(root: Element): Options {
  return { ...optionsOf(root), history: null, scroll: 'keep', focus: 'none' }
}

/** The link a plain click landed on, if bridge should follow it. */
function linkOf(event: MouseEvent): HTMLAnchorElement | null {
  const link = (event.target as Element | null)?.closest('a[href]')
  if (!(link instanceof HTMLAnchorElement)) return null
  return isPlainNavigation(clickOn(link, event)) ? link : null
}

function clickOn(link: HTMLAnchorElement, event: MouseEvent): Click {
  return {
    ...plainClickOn(link),
    button: event.button,
    modified: event.altKey || event.ctrlKey || event.metaKey || event.shiftKey,
    defaultPrevented: event.defaultPrevented,
  }
}
