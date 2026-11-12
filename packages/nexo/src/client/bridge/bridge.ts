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
import { TOP } from '../../shared/bridge/vocabulary'
import { Api } from './api'
import { ResponseCache } from './cache'
import type { ReturnDirection } from './change'
import { isPlainNavigation, plainClickOn, type Click } from './click'
import { BrowserFallback, RETURN } from './fallback'
import { isPlainSubmission, submissionOf, wantedFrom } from './forms'
import { HexTrail } from './hex'
import { HistoryKeeper } from './history'
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

/** How long a fetched page stays fresh for prefetch, twins and navigations ahead, unless its `Cache-Control` says otherwise. */
const CACHE_TTL = 60_000

/** On `<html>` while a bridge runs: a second one, from any script on the page, sees it. */
export const STARTED = 'data-bridge-started'

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
  const root = document.documentElement
  if (root.hasAttribute(STARTED))
    throw new Error(
      `bridge: it already runs on this page (<html ${STARTED}>); start it once: the served /_nexo/bridge.js or your client entry, not both`,
    )
  if (signal.aborted) return
  root.setAttribute(STARTED, '')
  running = new Running(signal)
  signal.addEventListener(
    'abort',
    () => {
      running = undefined
      root.removeAttribute(STARTED)
    },
    { once: true },
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
export function arrivals(
  fn: Arrival,
  options?: { signal?: AbortSignal },
): void {
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

/** One started bridge: its session, its watchers and its listeners, all ended by one signal. */
class Running {
  readonly api: Api
  private readonly session: Session
  private readonly watchers: Watcher[]

  constructor(private readonly signal: AbortSignal) {
    this.session = {
      loader: new Loader(new ResponseCache(CACHE_TTL)),
      inflight: new Inflight(),
      history: new HistoryKeeper(
        (url, targets, direction) => this.restore(url, targets, direction),
        signal,
      ),
    }
    this.api = new Api(this.session)
    this.watchers = [
      new Lazy(this.session, signal),
      new Prefetch(this.session.loader, signal),
      new HexTrail(this.session.history, signal),
    ]
    this.scan(document)
    this.listen()
  }

  private scan(root: ParentNode, from?: URL): void {
    for (const watcher of this.watchers) watcher.scan(root, from)
  }

  /** What arrives is scanned; links and forms are followed when they are bridge's. */
  private listen(): void {
    const { signal } = this
    document.addEventListener(
      'bridge:swapped',
      (event) => {
        const { url } = (event as CustomEvent<{ url: URL }>).detail
        this.scan(event.target as Element, url)
      },
      { signal },
    )
    document.addEventListener('click', (event) => this.click(event), { signal })
    document.addEventListener('submit', (event) => this.submit(event), {
      signal,
    })
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
    const { session } = this
    void new Navigation(
      trigger,
      wanted,
      swapper,
      options,
      session,
      fallback,
    ).run()
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
    const { session } = this
    const back = new Navigation(
      root,
      wanted,
      swapper,
      options,
      session,
      fallback,
    )
    return back.run().then(() => {})
  }
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
