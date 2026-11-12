/**
 * The links the client router takes (one visible chain per link). It
 * listens in the capture phase, before bridge; a link it claims is marked
 * `preventDefault()`, so bridge (which skips handled clicks) and then the
 * browser only see the rest. Neither module imports the other.
 */
export function claimClicks(
  claim: (url: URL) => boolean,
  signal: AbortSignal,
): void {
  const onClick = (event: MouseEvent) => {
    const link = linkOf(event)
    if (!link || !isPlain(event, link)) return
    if (claim(new URL(link.href))) event.preventDefault()
  }
  document.addEventListener('click', onClick, { capture: true, signal })
}

/** The link clicked, inside a shadow root too (`event.target` is retargeted to the host at the document). */
function linkOf(event: MouseEvent): HTMLAnchorElement | null {
  const target = (event.composedPath()[0] ?? event.target) as Element | null
  const link = target?.closest?.('a[href]') ?? null
  return link instanceof HTMLAnchorElement ? link : null
}

/** What the browser must keep: modified clicks, other buttons, downloads, other windows, other sites, jumps within the page. */
function isPlain(event: MouseEvent, link: HTMLAnchorElement): boolean {
  if (event.button !== 0 || event.defaultPrevented) return false
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
    return false
  if (link.hasAttribute('download') || (link.target && link.target !== '_self'))
    return false
  const url = new URL(link.href)
  return url.origin === location.origin && !withinPage(url)
}

function withinPage(url: URL): boolean {
  const here = new URL(location.href)
  return (
    url.hash !== '' &&
    url.pathname === here.pathname &&
    url.search === here.search
  )
}
