import { SEGMENT_ATTRIBUTE } from '../../shared/bridge/vocabulary'
import { QuietFallback } from './fallback'
import type { Wanted } from './loader'
import { Navigation, type Session } from './navigation'
import { optionsOf, type Options } from './options'
import { BySegments } from './segments'
import { Watch } from './watch'

export const SRC = 'data-bridge-src'

/**
 * Content that loads itself, by `data-bridge-load`: a link followed when it
 * comes into view (`viewport`) or at once (`eager`) — the "next" link at
 * the end of a shelf — and a segment with `data-bridge-src` that fills
 * itself from that URL the same way. Nobody clicked, so a failure moves
 * nothing: the element is released to be asked for again on sight.
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
    this.navigate(element, { url, method: 'GET' }, [name], options)
  }

  private followLink(link: HTMLAnchorElement): void {
    const options = optionsOf(link)
    if (options.target.kind !== 'segments') return
    const wanted = { url: new URL(link.href), method: 'GET' }
    this.navigate(link, wanted, options.target.names, options)
  }

  private navigate(
    element: Element,
    wanted: Omit<Wanted, 'segments'>,
    names: string[],
    options: Options,
  ): void {
    const { session } = this
    const quiet = new QuietFallback(element, wanted, () =>
      this.watch.release(element),
    )
    const swapper = new BySegments(names, options)
    void new Navigation(element, wanted, swapper, options, session, quiet).run()
  }
}
