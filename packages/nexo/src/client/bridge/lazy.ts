import { samePage } from '../../shared/bridge/segment-url'
import { SEGMENT_ATTRIBUTE } from '../../shared/bridge/vocabulary'
import { isPlainNavigation, plainClickOn } from './click'
import { QuietFallback } from './fallback'
import type { Wanted } from './loader'
import { Navigation, type Session } from './navigation'
import { optionsOf, type Options } from './options'
import type { Target } from './target'
import { parsed } from './origin'
import { BySegments } from './segments'
import { candidates, Watch } from './watch'

export const SRC = 'data-bridge-src'

const SELF_LOADING = `a[href], [${SEGMENT_ATTRIBUTE}][${SRC}]`

/** Where a link or a self-loading segment would go; what can't be parsed goes nowhere. */
function urlOf(element: Element): URL | null {
  const href =
    element instanceof HTMLAnchorElement
      ? element.href
      : element.getAttribute(SRC)
  return parsed(href ?? '', location.href)
}

/**
 * Content that loads itself, by `data-bridge-load`: a link followed when it
 * comes into view (`viewport`) or at once (`eager`) — the "next" link at
 * the end of a shelf — and a segment with `data-bridge-src` that fills
 * itself from that URL the same way. Nobody clicked, so a failure moves
 * nothing: the element is released to be asked for again on sight. What
 * just arrived from a URL never asks for that same URL again, so a
 * segment that renders itself with its own `src` loads once, not forever.
 * A link is followed only when a click on it would be bridge's: another
 * site, a download, one that opens elsewhere are the browser's. A segment
 * fills itself as its own target, whatever the page's: its scroll stays.
 */
export class Lazy {
  private readonly watch = new Watch(SELF_LOADING, 'load', (element) =>
    this.load(element),
  )

  constructor(private readonly session: Session) {}

  /** `from`: the URL the content in `root` just came from. */
  scan(root: ParentNode, from?: URL): void {
    if (from)
      for (const element of candidates(root, SELF_LOADING)) {
        const url = urlOf(element)
        if (url && samePage(url, from)) this.watch.skip(element)
      }
    this.watch.scan(root)
  }

  private load(element: Element): void {
    if (element instanceof HTMLAnchorElement) return this.followLink(element)
    const url = urlOf(element)
    if (!url) return
    const name = element.getAttribute(SEGMENT_ATTRIBUTE)!
    const target: Target = { kind: 'segments', names: [name] }
    const options = { ...optionsOf(element, target), history: null } as const
    this.navigate(element, { url, method: 'GET' }, [name], options)
  }

  private followLink(link: HTMLAnchorElement): void {
    if (!isPlainNavigation(plainClickOn(link))) return
    const options = optionsOf(link)
    const url = urlOf(link)
    if (options.target.kind !== 'segments' || !url) return
    this.navigate(link, { url, method: 'GET' }, options.target.names, options)
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
