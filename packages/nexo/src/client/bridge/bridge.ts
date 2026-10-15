/**
 * The browser side of bridge, served at /_nexo/bridge.js. It listens for
 * clicks on links and for form submissions; one inside a segment (or
 * pointing at one through `data-bridge-target`) is fetched and only that
 * segment is replaced. Everything else stays with the browser. Read
 * `navigation.ts` for the steps and `events.ts` for what the page can hook.
 */
import { TOP } from '../../shared/bridge/vocabulary'
import { ResponseCache } from './cache'
import { isPlainNavigation, type Click } from './click'
import { isPlainSubmission, submissionOf, wantedFrom } from './forms'
import { HexTrail } from './hex'
import { HistoryKeeper } from './history'
import { Inflight } from './inflight'
import { Lazy } from './lazy'
import { Loader, type Wanted } from './loader'
import { Navigation, type Session } from './navigation'
import { optionsOf, type Options } from './options'
import { WholePage } from './page'
import { BySegments } from './segments'
import type { Swapper } from './swapper'
import { Prefetch } from './prefetch'

/** How long a fetched page stays fresh for prefetch, twins and navigations ahead, unless its `Cache-Control` says otherwise. */
const CACHE_TTL = 60_000

const session: Session = {
  loader: new Loader(new ResponseCache(CACHE_TTL)),
  inflight: new Inflight(),
  history: new HistoryKeeper((url, targets) => restore(url, targets)),
}

/** What looks at the page as it is and as it changes: lazy content, prefetch, scroll markers. */
const watchers = [
  new Lazy(session),
  new Prefetch(session.loader),
  new HexTrail(session.history),
]
const scan = (root: ParentNode) => watchers.forEach((w) => w.scan(root))
scan(document)
document.addEventListener('bridge:swapped', (event) =>
  scan(event.target as Element),
)

document.addEventListener('click', (event) => {
  const link = linkOf(event)
  if (link) follow(event, link, { url: new URL(link.href), method: 'GET' })
})

document.addEventListener('submit', (event) => {
  const form = event.target as HTMLFormElement
  const submission = submissionOf(form, event.submitter)
  if (!isPlainSubmission(submission)) return
  follow(event, event.submitter ?? form, wantedFrom(submission), form)
})

/** Navigates when the trigger's options say so (segments or `_top`); else the browser keeps the event. */
function follow(
  event: Event,
  reader: Element,
  wanted: Omit<Wanted, 'segments'>,
  trigger: Element = reader,
): void {
  const options = optionsOf(reader)
  if (options.target.kind === 'none') return
  event.preventDefault()
  void navigationFor(trigger, wanted, options).run()
}

/** A whole page always makes an entry unless told to replace; segments only when asked. */
function navigationFor(
  trigger: Element,
  wanted: Omit<Wanted, 'segments'>,
  options: Options,
): Navigation {
  if (options.target.kind === 'segments') {
    const swapper = new BySegments(options.target.names, options)
    return new Navigation(trigger, wanted, swapper, options, session)
  }
  const history = options.history ?? 'push'
  const page = { ...options, history }
  return new Navigation(trigger, wanted, new WholePage(), page, session)
}

/** Back/forward: what changed to reach that entry is swapped again (a stale copy will do), nothing recorded. */
function restore(url: URL, targets: string[]): Promise<void> {
  const root = document.documentElement
  const options: Options = { ...optionsOf(root), history: null, scroll: 'keep' }
  const wanted = { url, method: 'GET', stale: true }
  const swapper: Swapper = targets.includes(TOP)
    ? new WholePage()
    : new BySegments(targets, options)
  return new Navigation(root, wanted, swapper, options, session).run()
}

/** The link a plain click landed on, if bridge should follow it. */
function linkOf(event: MouseEvent): HTMLAnchorElement | null {
  const link = (event.target as Element | null)?.closest('a[href]')
  if (!(link instanceof HTMLAnchorElement)) return null
  return isPlainNavigation(clickOn(link, event)) ? link : null
}

function clickOn(link: HTMLAnchorElement, event: MouseEvent): Click {
  return {
    button: event.button,
    modified: event.altKey || event.ctrlKey || event.metaKey || event.shiftKey,
    defaultPrevented: event.defaultPrevented,
    href: link.href,
    pageHref: location.href,
    download: link.hasAttribute('download'),
    opensElsewhere: link.target !== '' && link.target !== '_self',
  }
}
