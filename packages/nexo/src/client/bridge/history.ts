/**
 * The browser history as bridge uses it. Each entry remembers its URL,
 * which segments changed to reach it and where the page was scrolled.
 * Back/forward swap the segments again (from the cache when still there)
 * and put the scroll back; `_top` entries swap the whole page.
 */
export interface Entry {
  url: string
  /** The segments swapped to get here; null for the page as it first loaded. */
  targets: string[] | null
  scrollY: number
}

export type Restore = (url: URL, targets: string[]) => Promise<void>

export class HistoryKeeper {
  private current: Entry

  constructor(private readonly restore: Restore) {
    history.scrollRestoration = 'manual'
    this.current = { url: location.href, targets: null, scrollY: 0 }
    this.write('replaceState', this.current)
    addEventListener('popstate', (event: PopStateEvent) =>
      this.travel(event.state?.bridge),
    )
  }

  /** Called after a swap: `push` adds an entry, `replace` rewrites the current one. */
  record(url: URL, mode: 'push' | 'replace' | null, targets: string[]): void {
    if (!mode) return
    this.rememberScroll()
    this.current = { url: url.href, targets, scrollY: 0 }
    this.write(mode === 'push' ? 'pushState' : 'replaceState', this.current)
  }

  /** The current URL changed by other means (a scroll marker): the entry follows. */
  retitle(url: URL): void {
    this.current = { ...this.current, url: url.href }
    this.write('replaceState', this.current)
  }

  private rememberScroll(): void {
    this.current = { ...this.current, scrollY: scrollY }
    this.write('replaceState', this.current)
  }

  private write(how: 'pushState' | 'replaceState', entry: Entry): void {
    history[how]({ ...history.state, bridge: entry }, '', entry.url)
  }

  /**
   * Going from one entry to another, what changed between them is the
   * union of what each one swapped: enough whichever direction we travel.
   */
  private async travel(arriving: Entry | undefined): Promise<void> {
    if (!arriving) return
    const departing = this.current
    const targets = [
      ...new Set([...(departing.targets ?? []), ...(arriving.targets ?? [])]),
    ]
    this.current = arriving
    await this.restore(new URL(arriving.url), targets)
    scrollTo(0, arriving.scrollY)
  }
}
