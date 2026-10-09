import { withSegments } from '../../shared/bridge/segment-url'
import { SEGMENT_ATTRIBUTE } from '../../shared/bridge/vocabulary'
import { inherited, segmentIn } from './attributes'
import { announce } from './events'

/** One link followed by bridge: fetch the page, swap the segments, tell the page. */
export class Navigation {
  readonly url: URL

  constructor(
    private readonly trigger: HTMLAnchorElement,
    private readonly names: string[],
  ) {
    this.url = new URL(trigger.href)
  }

  async run(): Promise<void> {
    const { url, names } = this
    if (!announce(this.trigger, 'bridge:fetch', { url, targets: names })) return
    try {
      await this.swapFrom(await this.load())
    } catch (error) {
      this.fail(error)
    }
  }

  /** The page, asked for its segments only; a server error page swaps in like any other. */
  private async load(): Promise<Document> {
    const response = await fetch(withSegments(this.url, this.names), {
      headers: { accept: 'text/html' },
    })
    return new DOMParser().parseFromString(await response.text(), 'text/html')
  }

  private async swapFrom(page: Document): Promise<void> {
    const swaps = this.names.map((name) => this.pair(name, page))
    const swap = () =>
      swaps.forEach(({ current, incoming }) => current.replaceWith(incoming))
    const detail = { url: this.url, targets: this.names, page, swap }
    if (!announce(this.trigger, 'bridge:swap', detail)) return
    await this.transition(swap)
    this.done(swaps.map((s) => s.incoming))
  }

  /**
   * `bridge:swapped` goes on each new segment, not on the link: the link
   * usually left with the old content, and a detached element's events
   * reach nobody.
   */
  private done(elements: Element[]): void {
    for (const element of elements) {
      const name = element.getAttribute(SEGMENT_ATTRIBUTE)
      announce(element, 'bridge:swapped', { url: this.url, name })
    }
  }

  /** A segment missing on either side means nothing can be swapped: the browser navigates. */
  private pair(
    name: string,
    page: Document,
  ): { current: Element; incoming: Element } {
    const current = segmentIn(document, name)
    const incoming = segmentIn(page, name)
    if (!current || !incoming)
      throw new Error(
        `bridge: no segment "${name}" ${current ? 'in the response' : 'in this page'}`,
      )
    return { current, incoming }
  }

  /** With `data-bridge-transition="true"` inherited and a browser that can, a view transition. */
  private async transition(swap: () => void): Promise<void> {
    const wanted = inherited(this.trigger, 'transition') === 'true'
    if (wanted && document.startViewTransition)
      await document.startViewTransition(swap).finished
    else swap()
  }

  private fail(error: unknown): void {
    announce(this.trigger, 'bridge:fail', { url: this.url, error })
    location.assign(this.url)
  }
}
