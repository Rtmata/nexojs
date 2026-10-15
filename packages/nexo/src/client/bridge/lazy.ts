import { samePage } from '../../shared/bridge/segment-url'
import { SEGMENT_ATTRIBUTE } from '../../shared/bridge/vocabulary'
import { QuietFallback } from './fallback'
import type { Wanted } from './loader'
import { Navigation, type Session } from './navigation'
import { optionsOf, type Options } from './options'
import { BySegments } from './segments'
import { candidates, Watch } from './watch'

export const SRC = 'data-bridge-src'

const SELF_LOADING = `a[href], [${SEGMENT_ATTRIBUTE}][${SRC}]`

/** Where a link or a self-loading segment would go. */
function urlOf(element: Element): URL {
  if (element instanceof HTMLAnchorElement) return new URL(element.href)
  return new URL(element.getAttribute(SRC)!, location.href)
}

/**
 * Content that loads itself, by `data-bridge-load`: a link followed when it
 * comes into view (`viewport`) or at once (`eager`) — the "next" link at
 * the end of a shelf — and a segment with `data-bridge-src` that fills
 * itself from that URL the same way. Nobody clicked, so a failure moves
 * nothing: the element is released to be asked for again on sight. What
 * just arrived from a URL never asks for that same URL again, so a
 * segment that renders itself with its own `src` loads once, not forever.
 */
export class Lazy {
  private readonly watch = new Watch(SELF_LOADING, 'load', (element) =>
    this.load(element),
  )

  constructor(private readonly session: Session) {}

  /** `from`: the URL the content in `root` just came from. */
  scan(root: ParentNode, from?: URL): void {
    if (from)
      for (const element of candidates(root, SELF_LOADING))
        if (samePage(urlOf(element), from)) this.watch.skip(element)
    this.watch.scan(root)
  }

  private load(element: Element): void {
    if (element instanceof HTMLAnchorElement) return this.followLink(element)
    const url = urlOf(element)
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
