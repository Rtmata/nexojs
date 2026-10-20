import { samePage } from '../../shared/bridge/segment-url'
import { SEGMENT_ATTRIBUTE } from '../../shared/bridge/vocabulary'
import { announce } from './events'
import { BrowserFallback, type Fallback } from './fallback'
import { FocusMove } from './focus'
import type { HistoryKeeper } from './history'
import type { Flight, Inflight } from './inflight'
import type { Loaded, Loader, Wanted } from './loader'
import type { Options } from './options'
import type { Prepared, Swapper } from './swapper'

/** How a navigation ended: the content went in; bridge stopped (a cancelled event, a request a later one took over); or the page was left as it was or to the browser. */
export type Outcome = 'swapped' | 'cancelled' | 'left'

/** What every navigation shares: the cache behind the loader, the requests in flight, the history. */
export interface Session {
  loader: Loader
  inflight: Inflight
  history: HistoryKeeper
}

/**
 * One navigation, from a link, a form, lazy content or history: announce,
 * fetch (through the cache), swap the way the `Swapper` says (by segments
 * or the whole page), record, scroll, announce again. A response that
 * can't be swapped lands where the swapper says; a request that got no
 * response goes to the `Fallback`.
 */
export class Navigation {
  /** The requests counted on the targets when this one started: the same later means nothing came after it. */
  private turn = 0
  private outcome: Outcome = 'cancelled'

  constructor(
    private readonly trigger: Element,
    private readonly wanted: Omit<Wanted, 'segments'>,
    private readonly swapper: Swapper,
    private readonly options: Options,
    private readonly session: Session,
    private readonly fallback: Fallback = new BrowserFallback(trigger, wanted),
  ) {}

  async run(): Promise<Outcome> {
    const { url, method } = this.wanted
    const detail = { url, method, targets: this.swapper.targets }
    if (!announce(this.trigger, 'bridge:fetch', detail)) return 'cancelled'
    await this.fly(this.start())
    return this.outcome
  }

  /** The page already in hand (a landing that came whole): no request, the rest the same. */
  async arrive(loaded: Loaded): Promise<Outcome> {
    const flight = this.start()
    try {
      await this.show(loaded, flight)
      return this.outcome
    } finally {
      flight.end()
    }
  }

  private start(): Flight {
    const { targets } = this.swapper
    const { inflight } = this.session
    const flight = inflight.start(targets, this.trigger, this.swapper.busy())
    this.turn = inflight.count(targets)
    return flight
  }

  /** The request itself; an aborted one ends quietly, its successor took over — even when its response still arrives. */
  private async fly(flight: Flight): Promise<void> {
    try {
      const loaded = await this.load(flight)
      if (!flight.aborted) await this.show(loaded, flight)
    } catch (error) {
      if (flight.aborted) return
      flight.end() // before a retry starts its own, so none is cancelled
      this.outcome = await this.fallback.retry(error, this.onceMore())
    } finally {
      flight.end()
    }
  }

  private load(flight: Flight): Promise<Loaded> {
    const segments = this.swapper.segments()
    return this.session.loader.load({ ...this.wanted, segments }, flight.signal)
  }

  /** The response put in; one that can't be lands where the swapper says, as a navigation of its own once this one's flight is over. */
  private async show(loaded: Loaded, flight: Flight): Promise<void> {
    let prepared: Prepared
    try {
      prepared = this.swapper.prepare(loaded)
    } catch (error) {
      flight.end()
      this.outcome = await this.land(loaded, error)
      return
    }
    await this.take(loaded, prepared, flight)
    this.followUp(loaded)
  }

  /**
   * The response swapped in: `bridge:fail` first for an error answer (it
   * still goes in unless cancelled), `bridge:swap` before, `bridge:swapped`
   * on each new element after.
   */
  private async take(
    loaded: Loaded,
    prepared: Prepared,
    flight: Flight,
  ): Promise<void> {
    if (prepared.outdated) {
      this.outcome = 'left'
      return this.fallback.outdated(this.destination(loaded.url))
    }
    const detail = { ...loaded, targets: this.swapper.targets }
    if (loaded.status >= 400 && !announce(this.trigger, 'bridge:fail', detail))
      return
    await this.swap(loaded, prepared, flight)
  }

  /** A flight cancelled while the swap waited (for stylesheets, for the transition's capture) swaps nothing: its successor took over. */
  private async swap(
    loaded: Loaded,
    prepared: Prepared,
    flight: Flight,
  ): Promise<void> {
    const swap = () => prepared.apply()
    const detail = { ...loaded, targets: this.swapper.targets, swap }
    if (!announce(this.trigger, 'bridge:swap', detail)) return
    if (!(await ready(prepared, flight))) return
    const before = { scrollY, focused: document.activeElement } // read before the new content can shorten the page
    const swapped = () => (flight.aborted ? null : swap())
    const elements = await this.transition(swapped)
    if (elements) this.outcome = this.done(loaded.url, elements, before)
  }

  /** Waits for the DOM update, not the animation: history, scroll and `bridge:swapped` follow the swap, not the end of the crossfade. */
  private async transition(
    swap: () => Element[] | null,
  ): Promise<Element[] | null> {
    if (!this.options.transition || !document.startViewTransition) return swap()
    let elements: Element[] | null = null
    await document.startViewTransition(() => {
      elements = swap()
    }).updateCallbackDone
    return elements
  }

  /** Scrolled, focused, recorded (the entry starts where the page is now) and `bridge:swapped` on each new element: the trigger may have left with the old content. `before`: the scroll and the focus as they were. */
  private done(
    url: URL,
    elements: Element[],
    before: { scrollY: number; focused: Element | null },
  ): Outcome {
    const arrived = this.destination(url)
    this.scroll(elements, arrived.hash)
    new FocusMove(this.options.focus, arrived.hash).after(
      elements,
      before.focused,
    )
    this.record(arrived, before.scrollY)
    for (const element of elements) swapped(element, arrived)
    return 'swapped'
  }

  private record(arrived: URL, scrollBefore: number): void {
    const { history: mode } = this.options
    const { targets } = this.swapper
    this.session.history.record(arrived, mode, targets, scrollBefore)
  }

  /** The page the response came from, with the `#hash` the link named: fetch never sends it, the browser keeps it. */
  private destination(url: URL): URL {
    const arrived = new URL(url)
    arrived.hash = this.wanted.url.hash
    return arrived
  }

  /** The `#hash` wins, as it does for the browser; else the option. */
  private scroll(elements: Element[], hash: string): void {
    const anchor = anchorOf(hash)
    if (anchor) return anchor.scrollIntoView()
    if (this.options.scroll === 'top') scrollTo(0, 0)
    if (this.options.scroll === 'target') elements[0]?.scrollIntoView()
  }

  /**
   * Nothing to swap: the fallback decides, with the landing (if any) as
   * the other way in. A whole page in hand (the server ignored the
   * segments) goes in as it is; a fragment means the page it points at is
   * fetched whole, by GET. Nothing is resent either way.
   */
  private land(loaded: Loaded, error: unknown): Promise<Outcome> {
    const landing = this.swapper.landing()
    const own = this.options.history ?? 'push'
    const again =
      landing && ((history = own) => this.onto(landing, loaded, history))
    return this.fallback.land(loaded, error, again)
  }

  /** The page the response pointed at, brought another way: whole as it came, or fetched whole. */
  private onto(
    swapper: Swapper,
    loaded: Loaded,
    history: 'push' | 'replace',
  ): Promise<Outcome> {
    const next = this.landingOn(swapper, loaded.url, history)
    return loaded.whole ? next.arrive(loaded) : next.run()
  }

  /** The landing navigation: a new page, so an entry and the top; a GET, with the fallback of one. */
  private landingOn(
    swapper: Swapper,
    url: URL,
    history: 'push' | 'replace',
  ): Navigation {
    const options: Options = { ...this.options, history, scroll: 'top' }
    const wanted = { url: this.destination(url), method: 'GET' }
    const fallback = this.fallback.landing(wanted)
    const { trigger, session } = this
    return new Navigation(trigger, wanted, swapper, options, session, fallback)
  }

  /** A stale page shown going back: when a newer one arrives, the visitor is still there and nothing else was asked for these targets meanwhile (a click on the restored content stands), it is shown as a navigation of its own. */
  private followUp(loaded: Loaded): void {
    void loaded.revalidated?.then((changed) => {
      const here = samePage(new URL(location.href), loaded.url)
      const untouched =
        this.session.inflight.count(this.swapper.targets) === this.turn
      if (changed && here && untouched) void this.again().run()
    })
  }

  private again(): Navigation {
    const wanted = { ...this.wanted, stale: false }
    const { trigger, swapper, options, session, fallback } = this
    return new Navigation(trigger, wanted, swapper, options, session, fallback)
  }

  /** The same request once more, same key, and not a third time: null when it has no key or may not. */
  private onceMore(): (() => Promise<Outcome>) | null {
    if (!this.wanted.key || !this.options.retry) return null
    const { trigger, wanted, swapper, session, fallback } = this
    const options = { ...this.options, retry: false }
    const next = new Navigation(
      trigger,
      wanted,
      swapper,
      options,
      session,
      fallback,
    )
    return () => next.run()
  }
}

/** Whether the swap may go on once what it waits for is in: not for a flight cancelled before or meanwhile. */
async function ready(prepared: Prepared, flight: Flight): Promise<boolean> {
  if (flight.aborted) return false
  await prepared.ready(flight.signal)
  return !flight.aborted
}

/** The element a `#hash` names, if any; a hash that can't be read names none. */
function anchorOf(hash: string): Element | null {
  try {
    return hash
      ? document.getElementById(decodeURIComponent(hash.slice(1)))
      : null
  } catch {
    return null
  }
}

function swapped(element: Element, url: URL): void {
  const name = element.getAttribute(SEGMENT_ATTRIBUTE)
  announce(element, 'bridge:swapped', { url, name })
}
