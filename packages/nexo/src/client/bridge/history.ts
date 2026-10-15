/**
 * The browser history as bridge uses it. Each entry remembers its URL,
 * every segment swapped since the page first loaded, and where the page
 * was scrolled. Back/forward swap the segments again (from the cache when
 * still there) and put the scroll back; `_top` entries swap the whole page.
 */
export interface Entry {
  url: string
  /**
   * Every segment swapped since the page first loaded, not just the last
   * ones: the union of any two entries then covers whatever changed
   * between them, however far apart. Null for the page as it first loaded.
   */
  targets: string[] | null
  scrollY: number
}

export type Restore = (url: URL, targets: string[]) => Promise<void>

/** Milliseconds without scrolling before the position is written. */
const SETTLE = 150

export class HistoryKeeper {
  private current: Entry
  private settling: ReturnType<typeof setTimeout> | undefined

  constructor(private readonly restore: Restore) {
    history.scrollRestoration = 'manual'
    this.current = this.arrival()
    this.write('replaceState', this.current)
    scrollTo(0, this.current.scrollY)
    addEventListener('popstate', (event: PopStateEvent) =>
      this.travel(event.state?.bridge),
    )
    addEventListener('scroll', () => this.scrolled(), { passive: true })
  }

  /** Called after a swap and its scroll, with the scroll as it was before them: `push` adds an entry, `replace` rewrites the current one; either starts where the page is now. */
  record(
    url: URL,
    mode: 'push' | 'replace' | null,
    targets: string[],
    scrollBefore: number,
  ): void {
    if (!mode) return
    this.rememberScroll(scrollBefore)
    const swapped = [...new Set([...(this.current.targets ?? []), ...targets])]
    this.current = { url: url.href, targets: swapped, scrollY }
    this.write(mode === 'push' ? 'pushState' : 'replaceState', this.current)
  }

  /** The current URL changed by other means (a scroll marker): the entry follows. */
  retitle(url: URL): void {
    this.current = { ...this.current, url: url.href }
    this.write('replaceState', this.current)
  }

  /**
   * The entry this page loaded on. A reload, or a return by a full
   * navigation, finds what bridge wrote when leaving and keeps its
   * scroll; a first visit starts at the top.
   */
  private arrival(): Entry {
    const kept: Entry | undefined = history.state?.bridge
    return kept
      ? { ...kept, url: location.href }
      : { url: location.href, targets: null, scrollY: 0 }
  }

  /** The scroll goes into the entry once it settles (writing on every pixel would hit the browser's rate limit), so a reload or a return finds it: the browser's own restoration is off. */
  private scrolled(): void {
    clearTimeout(this.settling)
    this.settling = setTimeout(() => this.rememberScroll(scrollY), SETTLE)
  }

  private rememberScroll(y: number): void {
    this.current = { ...this.current, scrollY: y }
    this.write('replaceState', this.current)
  }

  private write(how: 'pushState' | 'replaceState', entry: Entry): void {
    history[how]({ ...history.state, bridge: entry }, '', entry.url)
  }

  /**
   * Going from one entry to another, what changed between them is the
   * union of what each one swapped: enough whichever direction we travel;
   * nothing swapped on either side means the same page, nothing to bring.
   * An entry without bridge's state is the browser's own: adopted.
   */
  private async travel(arriving: Entry | undefined): Promise<void> {
    if (!arriving) return this.adopt()
    const departing = this.current
    const targets = [
      ...new Set([...(departing.targets ?? []), ...(arriving.targets ?? [])]),
    ]
    this.current = arriving
    if (targets.length) await this.restore(new URL(arriving.url), targets)
    scrollTo(0, arriving.scrollY)
  }

  /** The browser made an entry on this page by itself (a jump to a `#hash`): same page, so what it has swapped so far stands; the URL is the browser's. */
  private adopt(): void {
    this.current = { ...this.current, url: location.href, scrollY }
    this.write('replaceState', this.current)
  }
}
