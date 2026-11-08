import type { Arrival } from './sources'

/**
 * Scrolling is Nexo's (E.1: one owner, bridge's vocabulary): a new page
 * starts at the top, or at its `#target`; back and forward return where
 * the visitor was on that page.
 */
export class Scroll {
  private readonly positions = new Map<string, number>()

  /** Before leaving `url`: remember where the visitor was. */
  leaving(url: URL): void {
    this.positions.set(url.href, scrollY)
  }

  /** After the new page is in, on the next frame. */
  arrived(url: URL, how: Arrival): void {
    requestAnimationFrame(() => this.place(url, how))
  }

  private place(url: URL, how: Arrival): void {
    if (how === 'traverse')
      return scrollTo(0, this.positions.get(url.href) ?? 0)
    const target = url.hash ? document.getElementById(decoded(url.hash)) : null
    if (target) target.scrollIntoView()
    else scrollTo(0, 0)
  }
}

/** The `#id`, percent-decoded when it can be (`#100%` can't: then as written). */
function decoded(hash: string): string {
  const id = hash.slice(1)
  try {
    return decodeURIComponent(id)
  } catch {
    return id
  }
}
