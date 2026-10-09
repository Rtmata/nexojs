import { announce } from './events'
import { loadNewStyles, mergeHead, trackedChanged } from './head'
import type { Flight } from './inflight'
import type { Loaded, Wanted } from './loader'
import type { Session } from './navigation'
import type { Options } from './options'

/** The name history gives whole-page entries, so back/forward swap the whole page again. */
export const TOP = '_top'

/**
 * The whole page swapped in place (`data-bridge-target="_top"`): the head
 * merged, the body replaced, nothing executed, an entry pushed. Everything
 * in flight is dropped first: a new page makes the old requests moot.
 */
export class FullPage {
  constructor(
    private readonly trigger: Element,
    private readonly wanted: Omit<Wanted, 'segments'>,
    private readonly options: Options,
    private readonly session: Session,
  ) {}

  async run(): Promise<void> {
    const { url, method } = this.wanted
    if (
      !announce(this.trigger, 'bridge:fetch', { url, method, targets: [TOP] })
    )
      return
    this.session.inflight.abortAll()
    const root = document.documentElement
    await this.fly(this.session.inflight.start([TOP], this.trigger, [root]))
  }

  private async fly(flight: Flight): Promise<void> {
    try {
      const wanted = { ...this.wanted, segments: [] }
      await this.swapFrom(await this.session.loader.load(wanted, flight.signal))
    } catch (error) {
      if (!flight.aborted) this.fail(error)
    } finally {
      flight.end()
    }
  }

  private async swapFrom(loaded: Loaded): Promise<void> {
    if (trackedChanged(loaded.page)) return location.assign(loaded.url)
    const swap = () => replace(loaded.page)
    const detail = { ...loaded, targets: [TOP], swap }
    if (loaded.status >= 400 && !announce(this.trigger, 'bridge:fail', detail))
      return
    if (!announce(this.trigger, 'bridge:swap', detail)) return
    await loadNewStyles(loaded.page)
    await this.transition(swap)
    this.done(loaded.url)
  }

  private done(url: URL): void {
    this.session.history.record(url, this.options.history, [TOP])
    if (this.options.scroll !== 'keep') scrollTo(0, 0)
    announce(document.body, 'bridge:swapped', { url, name: null })
  }

  private async transition(swap: () => void): Promise<void> {
    if (this.options.transition && document.startViewTransition)
      await document.startViewTransition(swap).finished
    else swap()
  }

  private fail(error: unknown): void {
    const { url, method } = this.wanted
    if (!announce(this.trigger, 'bridge:fail', { url, method, error })) return
    if (this.trigger instanceof HTMLFormElement) this.trigger.submit()
    else location.assign(url)
  }
}

/** The new document takes over: root attributes, head (merged) and body. */
function replace(page: Document): void {
  const root = document.documentElement
  for (const { name } of [...root.attributes]) root.removeAttribute(name)
  for (const { name, value } of page.documentElement.attributes)
    root.setAttribute(name, value)
  mergeHead(page)
  document.body.replaceWith(document.adoptNode(page.body))
}
