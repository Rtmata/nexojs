/**
 * The browser side of bridge, served at /_nexo/bridge.js. It listens for
 * clicks on links and for form submissions; one inside a segment (or
 * pointing at one through `data-bridge-target`) is fetched and only that
 * segment is replaced. Everything else stays with the browser. Read
 * `navigation.ts` for the steps and `events.ts` for what the page can hook.
 * The same from a script: `visit`, `reload` and `prefetch` (see `api.ts`).
 */
import { TOP } from '../../shared/bridge/vocabulary'
import { Api } from './api'
import { ResponseCache } from './cache'
import { isPlainNavigation, plainClickOn, type Click } from './click'
import { BrowserFallback, RETURN } from './fallback'
import { isPlainSubmission, submissionOf, wantedFrom } from './forms'
import { HexTrail } from './hex'
import { HistoryKeeper } from './history'
import { Inflight } from './inflight'
import { Lazy } from './lazy'
import { Loader, type Wanted } from './loader'
import { Navigation, type Session } from './navigation'
import { optionsOf, type Options, type VisitOptions } from './options'
import { WholePage } from './page'
import { BySegments } from './segments'
import { swapperFor, type Swapper } from './swapper'
import { Prefetch } from './prefetch'

/** How long a fetched page stays fresh for prefetch, twins and navigations ahead, unless its `Cache-Control` says otherwise. */
const CACHE_TTL = 60_000

const session: Session = {
  loader: new Loader(new ResponseCache(CACHE_TTL)),
  inflight: new Inflight(),
  history: new HistoryKeeper((url, targets) => restore(url, targets)),
}

const api = new Api(session)
export const visit = (url: string | URL, options?: VisitOptions) =>
  api.visit(url, options)
export const reload = (
  target: string | readonly string[],
  options?: VisitOptions,
) => api.reload(target, options)
export const prefetch = (url: string | URL, options?: VisitOptions) =>
  api.prefetch(url, options)
export type { VisitOptions }

/** What looks at the page as it is and as it changes: lazy content, prefetch, scroll markers. */
interface Watcher {
  /** `from`: the URL the content in `root` just came from. */
  scan(root: ParentNode, from?: URL): void
}
const watchers: Watcher[] = [
  new Lazy(session),
  new Prefetch(session.loader),
  new HexTrail(session.history),
]
const scan = (root: ParentNode, from?: URL) =>
  watchers.forEach((w) => w.scan(root, from))
scan(document)
document.addEventListener('bridge:swapped', (event) => {
  const { url } = (event as CustomEvent<{ url: URL }>).detail
  scan(event.target as Element, url)
})

document.addEventListener('click', (event) => {
  const link = linkOf(event)
  if (link)
    follow(event, link, link, { url: new URL(link.href), method: 'GET' })
})

document.addEventListener('submit', (event) => {
  const submission = submissionOf(event)
  if (!isPlainSubmission(submission)) return
  const form = event.target as HTMLFormElement
  const wanted = wantedFrom(submission)
  follow(event, event.submitter ?? form, form, wanted)
})

/**
 * Navigates when the reader's options say so (segments or `_top`); else
 * the browser keeps the event. The reader is where the attributes are
 * read from (the submit button, when there is one); the trigger is what
 * carries the events and the active mark (the form).
 */
function follow(
  event: Event,
  reader: Element,
  trigger: Element,
  wanted: Omit<Wanted, 'segments'>,
): void {
  const options = optionsOf(reader)
  const swapper = swapperFor(options)
  if (!swapper) return
  event.preventDefault()
  void navigation(trigger, wanted, swapper, options).run()
}

/** A navigation the visitor asked for: the browser is its fallback. */
function navigation(
  trigger: Element,
  wanted: Omit<Wanted, 'segments'>,
  swapper: Swapper,
  options: Options,
): Navigation {
  const fallback = new BrowserFallback(trigger, wanted)
  return new Navigation(trigger, wanted, swapper, options, session, fallback)
}

/** Back/forward: what changed to reach that entry is swapped again (a stale copy will do), nothing recorded; whatever fails rewrites the entry, never adds one. */
function restore(url: URL, targets: string[]): Promise<void> {
  const root = document.documentElement
  const options = restoreOptions(root)
  const wanted = { url, method: 'GET', stale: true }
  const swapper: Swapper = targets.includes(TOP)
    ? new WholePage()
    : new BySegments(targets, options)
  const fallback = new BrowserFallback(root, wanted, RETURN)
  const back = new Navigation(root, wanted, swapper, options, session, fallback)
  return back.run().then(() => {})
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
