import type { ReturnDirection } from './change'

/**
 * The browser history as bridge uses it. Each entry remembers its URL,
 * every segment swapped since the page first loaded, and where the page
 * was scrolled. Back/forward swap the segments again (from the cache when
 * still there) and put the scroll back; `_top` entries swap the whole page.
 */
export interface Entry {
  url: string
  /**
   * Every target swapped since the page first loaded, in order, repeats
   * and `_top` included: one entry's list is a prefix of any later one's
   * (one line of history), so what lies past the shorter is exactly what
   * changed between two entries, however far apart. Empty for the page as
   * it first loaded.
   */
  targets: string[]
  scrollY: number
  /**
   * What the page showed: a new id with every swap recorded, the same one
   * in the entries the browser makes on top of it (a `#hash` jump). Two
   * entries that share it have nothing to bring between them.
   */
  content: string
  /** Its place in the line of entries: a return compares them to know back from forward. */
  index: number
}

export type Restore = (
  url: URL,
  targets: string[],
  direction: ReturnDirection,
) => Promise<void>

/** Milliseconds without a change before the entry is written. */
const SETTLE = 150

export class HistoryKeeper {
  /** The entry the browser is on. */
  private current: Entry
  /**
   * The entry whose content the page shows: the current one, except while
   * a travel's restore is still on its way — the next travel then starts
   * from what is really there, not from an entry that never arrived. Read
   * for its `content` and `targets` only.
   */
  private shown: Entry
  private settling: ReturnType<typeof setTimeout> | undefined
  /** The travel under way, if any: the scroll goes back only for the one that is still it. */
  private trip: object | null = null
  /** A URL a scroll marker asked for, waiting for the page to settle; null when the address bar is right as it is. */
  private retitled: string | null = null

  constructor(
    private readonly restore: Restore,
    signal: AbortSignal,
  ) {
    history.scrollRestoration = 'manual'
    this.current = this.shown = this.kept() ?? this.fresh()
    this.write('replaceState', this.current)
    addEventListener(
      'popstate',
      (event: PopStateEvent) => this.travel(event.state?.bridge),
      { signal },
    )
    addEventListener('scroll', () => this.settle(), { passive: true, signal })
    signal.addEventListener(
      'abort',
      () => (history.scrollRestoration = 'auto'),
      {
        once: true,
      },
    )
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
    const swapped = [...this.current.targets, ...targets]
    const content = stamp()
    const index = this.current.index + (mode === 'push' ? 1 : 0)
    this.current = { url: url.href, targets: swapped, scrollY, content, index }
    this.shown = this.current
    this.write(mode === 'push' ? 'pushState' : 'replaceState', this.current)
  }

  /** The current URL changed by a scroll marker: the entry follows, once the page settles. */
  retitle(url: URL): void {
    this.retitled = url.href
    this.settle()
  }

  /** A reload, or a return by a full navigation, finds what bridge wrote when leaving: its scroll goes back. */
  private kept(): Entry | null {
    const kept: Entry | undefined = history.state?.bridge
    if (!kept) return null
    scrollTo(0, kept.scrollY)
    return { ...indexed(kept), url: location.href }
  }

  /** A first visit starts where the browser put the page: the top, or its `#hash`. */
  private fresh(): Entry {
    const content = stamp()
    return { url: location.href, targets: [], scrollY, content, index: 0 }
  }

  /** One write once the page settles (writing on every pixel or marker would hit the browser's rate limit): the scroll as it is then, so a reload or a return finds it — the browser's own restoration is off. While a travel is under way, the scroll is the page's on its way out, not this entry's: not written. */
  private settle(): void {
    if (this.trip) return
    clearTimeout(this.settling)
    this.settling = setTimeout(() => this.rememberScroll(scrollY), SETTLE)
  }

  /** The entry rewritten where the page is: a marker's URL if one is waiting, else the address bar as it stands — the page may have changed it itself (a tab, a filter), and that stays. */
  private rememberScroll(y: number): void {
    const url = this.retitled ?? location.href
    this.retitled = null
    this.current = { ...this.current, url, scrollY: y }
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
  private async travel(written: Entry | undefined): Promise<void> {
    if (!written) return this.adopt()
    const arriving = indexed(written)
    const trip = this.depart()
    const targets = changedBetween(this.shown, arriving)
    const direction = arriving.index < this.current.index ? 'back' : 'forward'
    this.current = arriving
    if (targets.length)
      await this.restore(new URL(arriving.url), targets, direction)
    if (this.trip === trip) this.arrived(arriving)
  }

  /** The travel is still the latest: what it shows is the entry's, its scroll goes back. */
  private arrived(arriving: Entry): void {
    this.trip = null
    this.shown = arriving
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

/**
 * The targets to swap again between two entries: none when they showed
 * the same content; else what the longer list has past the shorter, its
 * prefix. Lists that don't match that way (an entry from another life of
 * the page) are taken whole, both.
 */
function changedBetween(a: Entry, b: Entry): string[] {
  if (a.content === b.content) return []
  const [short, long] = a.targets.length <= b.targets.length ? [a, b] : [b, a]
  const prefix = short.targets.every((name, i) => long.targets[i] === name)
  const changed = prefix
    ? long.targets.slice(short.targets.length)
    : [...short.targets, ...long.targets]
  return [...new Set(changed)]
}

/** Entries written by a script from before indexed entries have no index: the first place, so a return compares numbers. */
function indexed(entry: Entry): Entry {
  return { ...entry, index: entry.index ?? 0 }
}

/** An id for what the page shows: unlike any other in this tab's history, which is all it has to be. */
function stamp(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}
