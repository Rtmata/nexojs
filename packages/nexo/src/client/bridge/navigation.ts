import { SEGMENT_ATTRIBUTE } from '../../shared/bridge/vocabulary'
import { announce } from './events'
import { BrowserFallback, type Fallback } from './fallback'
import type { HistoryKeeper } from './history'
import type { Flight, Inflight } from './inflight'
import type { Loaded, Loader, Wanted } from './loader'
import type { Options } from './options'
import type { Prepared, Swapper } from './swapper'

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
  constructor(
    private readonly trigger: Element,
    private readonly wanted: Omit<Wanted, 'segments'>,
    private readonly swapper: Swapper,
    private readonly options: Options,
    private readonly session: Session,
    private readonly fallback: Fallback = new BrowserFallback(trigger, wanted),
  ) {}

  async run(): Promise<void> {
    const { url, method } = this.wanted
    const detail = { url, method, targets: this.swapper.targets }
    if (!announce(this.trigger, 'bridge:fetch', detail)) return
    const { inflight } = this.session
    const busy = this.swapper.busy()
    await this.fly(inflight.start(this.swapper.targets, this.trigger, busy))
  }

  /** The request itself; an aborted one ends quietly, its successor took over. */
  private async fly(flight: Flight): Promise<void> {
    try {
      await this.show(await this.load(flight))
    } catch (error) {
      if (!flight.aborted) this.fallback.retry(error)
    } finally {
      flight.end()
    }
  }

  private load(flight: Flight): Promise<Loaded> {
    const segments = this.swapper.segments()
    return this.session.loader.load({ ...this.wanted, segments }, flight.signal)
  }

  /** The response put in; one that can't be lands where the swapper says. */
  private async show(loaded: Loaded): Promise<void> {
    try {
      await this.take(loaded)
      this.followUp(loaded)
    } catch (error) {
      await this.land(loaded, error)
    }
  }

  /**
   * The response swapped in: `bridge:fail` first for an error answer (it
   * still goes in unless cancelled), `bridge:swap` before, `bridge:swapped`
   * on each new element after. Throws when there is nothing to swap.
   */
  async take(loaded: Loaded): Promise<void> {
    const prepared = this.swapper.prepare(loaded)
    if (prepared.outdated) return location.assign(loaded.url)
    const detail = { ...loaded, targets: this.swapper.targets }
    if (loaded.status >= 400 && !announce(this.trigger, 'bridge:fail', detail))
      return
    await this.swap(loaded, prepared)
  }

  private async swap(loaded: Loaded, prepared: Prepared): Promise<void> {
    const swap = () => prepared.apply()
    const detail = { ...loaded, targets: this.swapper.targets, swap }
    if (!announce(this.trigger, 'bridge:swap', detail)) return
    await prepared.ready()
    this.done(loaded.url, await this.transition(swap))
  }

  private async transition(swap: () => Element[]): Promise<Element[]> {
    if (!this.options.transition || !document.startViewTransition) return swap()
    let elements: Element[] = []
    await document.startViewTransition(() => {
      elements = swap()
    }).finished
    return elements
  }

  /** Recorded, scrolled, and `bridge:swapped` on each new element: the trigger may have left with the old content. */
  private done(url: URL, elements: Element[]): void {
    this.session.history.record(url, this.options.history, this.swapper.targets)
    this.scroll(elements)
    for (const element of elements) {
      const name = element.getAttribute(SEGMENT_ATTRIBUTE)
      announce(element, 'bridge:swapped', { url, name })
    }
  }

  private scroll(elements: Element[]): void {
    if (this.options.scroll === 'top') scrollTo(0, 0)
    if (this.options.scroll === 'target') elements[0]?.scrollIntoView()
  }

  /** Nothing to swap: the fallback decides, with the landing (if any) as the other way in. */
  private async land(loaded: Loaded, error: unknown): Promise<void> {
    const landing = this.swapper.landing()
    const take = landing && ((page: Loaded) => this.onto(landing).take(page))
    await this.fallback.land(loaded, error, take)
  }

  /** The same navigation swapped another way: a new page, so an entry (unless told to replace) and the top. */
  private onto(swapper: Swapper): Navigation {
    const history = this.options.history ?? 'push'
    const options: Options = { ...this.options, history, scroll: 'top' }
    const { trigger, wanted, session, fallback } = this
    return new Navigation(trigger, wanted, swapper, options, session, fallback)
  }

  /** A stale page shown going back: when a newer one arrives, it is shown as a navigation of its own. */
  private followUp(loaded: Loaded): void {
    void loaded.revalidated?.then((changed) => {
      if (changed) void this.again().run()
    })
  }

  private again(): Navigation {
    const wanted = { ...this.wanted, stale: false }
    const { trigger, swapper, options, session, fallback } = this
    return new Navigation(trigger, wanted, swapper, options, session, fallback)
  }
}
