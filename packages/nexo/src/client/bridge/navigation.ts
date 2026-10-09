import { SEGMENT_ATTRIBUTE } from '../../shared/bridge/vocabulary'
import { segmentIn } from './attributes'
import { announce } from './events'
import type { HistoryKeeper } from './history'
import type { Flight, Inflight } from './inflight'
import type { Loaded, Loader, Wanted } from './loader'
import type { Options } from './options'
import { apply, errorSwap, pairAll, twinNames, type Swap } from './swaps'

/** What every navigation shares: the cache behind the loader, the requests in flight, the history. */
export interface Session {
  loader: Loader
  inflight: Inflight
  history: HistoryKeeper
}

/**
 * One navigation by segments, from a link, a form or history: announce,
 * fetch (through the cache), pair the segments, swap, record, scroll,
 * announce again. Anything that can't be swapped goes to the browser.
 */
export class Navigation {
  constructor(
    private readonly trigger: Element,
    private readonly wanted: Omit<Wanted, 'segments'>,
    private readonly names: string[],
    private readonly options: Options,
    private readonly session: Session,
  ) {}

  async run(): Promise<void> {
    const { url, method } = this.wanted
    const detail = { url, method, targets: this.names }
    if (!announce(this.trigger, 'bridge:fetch', detail)) return
    const { inflight } = this.session
    await this.fly(inflight.start(this.names, this.trigger, this.busy()))
  }

  /** The request itself; an aborted one ends quietly, its successor took over. */
  private async fly(flight: Flight): Promise<void> {
    try {
      await this.swapFrom(await this.load(flight))
    } catch (error) {
      if (!flight.aborted) this.fail(error)
    } finally {
      flight.end()
    }
  }

  /** Twins ride along in the request, so one response refreshes them too. */
  private load(flight: Flight): Promise<Loaded> {
    const segments = [...new Set([...this.names, ...twinNames()])]
    return this.session.loader.load({ ...this.wanted, segments }, flight.signal)
  }

  private async swapFrom(loaded: Loaded): Promise<void> {
    const swaps = this.plan(loaded)
    if (!swaps) return
    const detail = { ...loaded, targets: this.names, swap: () => apply(swaps) }
    if (!announce(this.trigger, 'bridge:swap', detail)) return
    const elements = await this.transition(() => apply(swaps))
    this.session.history.record(loaded.url, this.options.history, this.names)
    this.scroll(elements)
    this.done(loaded.url, elements)
  }

  /**
   * A normal answer pairs the targets (and twins). An error answer goes
   * into the fail segment or the targets, unless `bridge:fail` is cancelled.
   */
  private plan(loaded: Loaded): Swap[] | null {
    if (loaded.status < 400)
      return pairAll(this.names, loaded.page, this.options.swap)
    const detail = { ...loaded, targets: this.names }
    if (!announce(this.trigger, 'bridge:fail', detail)) return null
    const into = this.options.fail ? [this.options.fail] : this.names
    return into.map((name) => errorSwap(name, loaded.page))
  }

  private async transition(swap: () => Element[]): Promise<Element[]> {
    if (!this.options.transition || !document.startViewTransition) return swap()
    let elements: Element[] = []
    await document.startViewTransition(() => {
      elements = swap()
    }).finished
    return elements
  }

  private scroll(elements: Element[]): void {
    if (this.options.scroll === 'top') scrollTo(0, 0)
    if (this.options.scroll === 'target') elements[0]?.scrollIntoView()
  }

  /** `bridge:swapped` goes on each new segment: the trigger may have left with the old content. */
  private done(url: URL, elements: Element[]): void {
    for (const element of elements) {
      const name = element.getAttribute(SEGMENT_ATTRIBUTE)
      announce(element, 'bridge:swapped', { url, name })
    }
  }

  /** The targets, plus the segment named by `data-bridge-busy`, carry `aria-busy` meanwhile. */
  private busy(): Element[] {
    const names = this.options.busy
      ? [...this.names, this.options.busy]
      : this.names
    return names
      .map((name) => segmentIn(document, name))
      .filter((element): element is Element => element !== null)
  }

  /** Nothing could be swapped: tell the page, then let the browser do it its way. */
  private fail(error: unknown): void {
    const { url, method } = this.wanted
    if (!announce(this.trigger, 'bridge:fail', { url, method, error })) return
    if (this.trigger instanceof HTMLFormElement) this.trigger.submit()
    else location.assign(url)
  }
}
