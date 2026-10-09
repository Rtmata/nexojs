import type { HistoryKeeper } from './history'

export const HEX = 'data-bridge-hex'

/**
 * Markers along a long page (`data-bridge-hex="/es/arcade/anio/1985"` on
 * each year heading). When the topmost visible marker changes, the URL is
 * replaced with its value, so the address follows the scroll and a reload
 * or a shared link lands where the reader was.
 */
export class HexTrail {
  private readonly visible = new Set<Element>()
  private readonly observer = new IntersectionObserver((entries) =>
    this.update(entries),
  )

  constructor(private readonly history: HistoryKeeper) {}

  scan(root: ParentNode): void {
    for (const marker of root.querySelectorAll(`[${HEX}]`))
      this.observer.observe(marker)
  }

  private update(entries: IntersectionObserverEntry[]): void {
    for (const entry of entries) {
      if (entry.isIntersecting) this.visible.add(entry.target)
      else this.visible.delete(entry.target)
    }
    const top = topmost([...this.visible].filter((m) => m.isConnected))
    if (top) this.follow(top)
  }

  private follow(marker: Element): void {
    const url = new URL(marker.getAttribute(HEX)!, location.href)
    if (url.href !== location.href) this.history.retitle(url)
  }
}

function topmost(markers: Element[]): Element | undefined {
  return markers.sort(
    (a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top,
  )[0]
}
