import { SEGMENT_ATTRIBUTE } from '../../shared/bridge/vocabulary'
import { Navigation, type Session } from './navigation'
import { optionsOf } from './options'
import { Watch } from './watch'

export const SRC = 'data-bridge-src'

/**
 * Content that loads itself, by `data-bridge-load`: a link followed when it
 * comes into view (`viewport`) or at once (`eager`) — the "next" link at
 * the end of a shelf — and a segment with `data-bridge-src` that fills
 * itself from that URL the same way.
 */
export class Lazy {
  private readonly watch = new Watch(
    `a[href], [${SEGMENT_ATTRIBUTE}][${SRC}]`,
    'load',
    (element) => this.load(element),
  )

  constructor(private readonly session: Session) {}

  scan(root: ParentNode): void {
    this.watch.scan(root)
  }

  private load(element: Element): void {
    if (element instanceof HTMLAnchorElement) return this.followLink(element)
    const url = new URL(element.getAttribute(SRC)!, location.href)
    const name = element.getAttribute(SEGMENT_ATTRIBUTE)!
    const options = { ...optionsOf(element), history: null } as const
    const wanted = { url, method: 'GET' }
    void new Navigation(element, wanted, [name], options, this.session).run()
  }

  private followLink(link: HTMLAnchorElement): void {
    const options = optionsOf(link)
    if (options.target.kind !== 'segments') return
    const wanted = { url: new URL(link.href), method: 'GET' }
    const { names } = options.target
    void new Navigation(link, wanted, names, options, this.session).run()
  }
}
