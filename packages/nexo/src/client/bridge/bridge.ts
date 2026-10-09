/**
 * The browser side of bridge, served at /_nexo/bridge.js. It listens for
 * clicks on links; a link inside a segment (or pointing at one through
 * `data-bridge-target`) is fetched and only that segment is replaced.
 * Everything else stays with the browser. Read `navigation.ts` for the
 * steps and `events.ts` for what the page can hook into.
 */
import { enclosingSegment, inherited } from './attributes'
import { isPlainNavigation, type Click } from './click'
import { Navigation } from './navigation'
import { targetOf } from './target'

document.addEventListener('click', (event) => {
  const link = linkOf(event)
  if (!link) return
  const target = targetOf(inherited(link, 'target'), enclosingSegment(link))
  if (target.kind !== 'segments') return // `_top` comes with the next layer
  event.preventDefault()
  void new Navigation(link, target.names).run()
})

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
    pageOrigin: location.origin,
    download: link.hasAttribute('download'),
    opensElsewhere: link.target !== '' && link.target !== '_self',
  }
}
