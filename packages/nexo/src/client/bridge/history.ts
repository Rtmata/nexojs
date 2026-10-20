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
  /**
   * What the page showed: a new id with every swap recorded, the same one
   * in the entries the browser makes on top of it (a `#hash` jump). Two
   * entries that share it have nothing to bring between them.
   */
  content: string
}

export type Restore = (url: URL, targets: string[]) => Promise<void>

/** Milliseconds without a change before the entry is written. */
const SETTLE = 150

export class HistoryKeeper {
  private current: Entry
  private settling: ReturnType<typeof setTimeout> | undefined
  /** The travel under way, if any: the scroll goes back only for the one that is still it. */
  private trip: object | null = null

  constructor(private readonly restore: Restore) {
    history.scrollRestoration = 'manual'
    this.current = this.kept() ?? this.fresh()
    this.write('replaceState', this.current)
    addEventListener('popstate', (event: PopStateEvent) =>
      this.travel(event.state?.bridge),
    )
    addEventListener('scroll', () => this.settle(), { passive: true })
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
    const content = stamp()
    this.current = { url: url.href, targets: swapped, scrollY, content }
    this.write(mode === 'push' ? 'pushState' : 'replaceState', this.current)
  }

  /** The current URL changed by other means (a scroll marker): the entry follows, once the page settles. */
  retitle(url: URL): void {
    this.current = { ...this.current, url: url.href }
    this.settle()
  }

  /** A reload, or a return by a full navigation, finds what bridge wrote when leaving: its scroll goes back. */
  private kept(): Entry | null {
    const kept: Entry | undefined = history.state?.bridge
    if (!kept) return null
    scrollTo(0, kept.scrollY)
    return { ...kept, url: location.href }
  }

  /** A first visit starts where the browser put the page: the top, or its `#hash`. */
  private fresh(): Entry {
    const content = stamp()
    return { url: location.href, targets: null, scrollY, content }
  }

  /** One write once the page settles (writing on every pixel or marker would hit the browser's rate limit): the scroll as it is then, so a reload or a return finds it — the browser's own restoration is off. While a travel is under way, the scroll is the page's on its way out, not this entry's: not written. */
  private settle(): void {
    if (this.trip) return
    clearTimeout(this.settling)
    this.settling = setTimeout(() => this.rememberScroll(scrollY), SETTLE)
  }

  private rememberScroll(y: number): void {
    this.current = { ...this.current, scrollY: y }
    this.write('replaceState', this.current)
  }

  /** A new entry starts with bridge's state alone; a rewrite keeps what else the page put in the entry. */
  private write(how: 'pushState' | 'replaceState', entry: Entry): void {
    const state =
      how === 'pushState'
        ? { bridge: entry }
        : { ...history.state, bridge: entry }
    history[how](state, '', entry.url)
  }

  /**
   * Going from one entry to another, what changed between them is the
   * union of what each one swapped: enough whichever direction we travel;
   * nothing swapped on either side, or the same content on both, means
   * nothing to bring. An entry without bridge's state is the browser's
   * own: adopted. The scroll goes back only if no later travel took over
   * meanwhile.
   */
  private async travel(arriving: Entry | undefined): Promise<void> {
    if (!arriving) return this.adopt()
    const trip = this.depart()
    const targets = changedBetween(this.current, arriving)
    this.current = arriving
    if (targets.length) await this.restore(new URL(arriving.url), targets)
    if (this.trip !== trip) return
    this.trip = null
    scrollTo(0, arriving.scrollY)
  }

  /** A travel begins: a pending write of the scroll is dropped, it was the page we are leaving. */
  private depart(): object {
    clearTimeout(this.settling)
    return (this.trip = {})
  }

  /** The browser made an entry on this page by itself (a jump to a `#hash`): same page, so what it has swapped so far stands; the URL is the browser's. */
  private adopt(): void {
    this.current = { ...this.current, url: location.href, scrollY }
    this.write('replaceState', this.current)
  }
}

/** The segments to swap again between two entries: none when they showed the same content. */
function changedBetween(departing: Entry, arriving: Entry): string[] {
  if (departing.content === arriving.content) return []
  return [
    ...new Set([...(departing.targets ?? []), ...(arriving.targets ?? [])]),
  ]
}

/** An id for what the page shows: unlike any other in this tab's history, which is all it has to be. */
function stamp(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}
