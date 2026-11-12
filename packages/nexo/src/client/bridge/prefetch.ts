import { inherited } from './attributes'
import { isPlainNavigation, plainClickOn } from './click'
import type { Loader } from './loader'
import { optionsOf } from './options'
import { parsed } from './origin'
import { swapperFor } from './swapper'
import { Watch } from './watch'

/**
 * Pages brought ahead of a click, by `data-bridge-prefetch`: `tap` (on
 * pointer down), `hover` (pointer over or focus), `viewport`, `eager`.
 * bridge links go into the response cache; links left to the browser get
 * Speculation Rules with the matching eagerness, where the browser has them.
 * Only a page a click would use is brought: another site, a download or
 * a link that opens elsewhere are the browser's, prefetched or not.
 *
 * A hover waits a moment first (`data-bridge-prefetch-delay`, in ms,
 * 80 by default: a cursor passing through costs nothing; `0` brings it at
 * once), and is dropped if the pointer leaves meanwhile. A visitor who
 * asked to save data, or is on a 2G connection, gets nothing ahead of a
 * click: that choice is theirs, not the site's. The browser applies the
 * same to its own rules.
 */
export class Prefetch {
  private readonly watch: Watch
  private readonly rules = new SpeculationRules()
  private readonly hovers = new Hovers((link) => this.bring(link))

  constructor(
    private readonly loader: Loader,
    signal: AbortSignal,
  ) {
    const bring = (link: Element) => this.bring(link as HTMLAnchorElement)
    this.watch = new Watch('a[href]', 'prefetch', bring, signal)
    this.listen(signal)
    signal.addEventListener('abort', () => this.stop(), { once: true })
  }

  /** Taps bring at once; hovers and focus after a delay, dropped when they leave first. */
  private listen(signal: AbortSignal): void {
    const capture = { capture: true, signal }
    const on = (type: string, fn: (event: Event) => void) =>
      document.addEventListener(type, fn, capture)
    on('pointerdown', (e) => this.on(e, 'tap'))
    on('pointerover', (e) => this.on(e, 'hover'))
    on('focusin', (e) => this.on(e, 'hover'))
    on('pointerout', (e) => this.off(e))
    on('focusout', (e) => this.off(e))
  }

  /** bridge stopped: no hover waits, and its rules leave the page. */
  private stop(): void {
    this.hovers.clear()
    this.rules.clear()
  }

  scan(root: ParentNode): void {
    if (!savingData()) this.watch.scan(root)
    this.rules.scan(root)
  }

  private on(event: Event, when: 'tap' | 'hover'): void {
    const link = linkOf(event)
    if (!link || inherited(link, 'prefetch') !== when) return
    if (when === 'tap') this.bring(link)
    else this.hovers.begin(link, delayOf(link))
  }

  private off(event: Event): void {
    const link = linkOf(event)
    if (link) this.hovers.end(link)
  }

  /** A bridge link's page, asked for the way a click would: by segments, or whole. The loader decides whether it is worth bringing: not what it has, nor what is on its way, nor what it could not keep lately. */
  private bring(link: HTMLAnchorElement): void {
    if (savingData() || !isPlainNavigation(plainClickOn(link))) return
    const swapper = swapperFor(optionsOf(link))
    const url = parsed(link.href, location.href)
    if (!swapper || !url) return
    void this.loader.prefetch(url, swapper.segments()).catch(() => {})
  }
}

/**
 * Hovers under way: each link's timer, started when the pointer arrives
 * and dropped when it leaves before the delay is over.
 */
class Hovers {
  private readonly timers = new Map<Element, ReturnType<typeof setTimeout>>()

  constructor(private readonly bring: (link: HTMLAnchorElement) => void) {}

  begin(link: HTMLAnchorElement, delay: number): void {
    if (this.timers.has(link)) return
    const timer = setTimeout(() => {
      this.timers.delete(link)
      this.bring(link)
    }, delay)
    this.timers.set(link, timer)
  }

  end(link: Element): void {
    clearTimeout(this.timers.get(link))
    this.timers.delete(link)
  }

  clear(): void {
    for (const timer of this.timers.values()) clearTimeout(timer)
    this.timers.clear()
  }
}

/** The link an event happened on, if any. */
function linkOf(event: Event): HTMLAnchorElement | null {
  const link = (event.target as Element | null)?.closest('a[href]')
  return link instanceof HTMLAnchorElement ? link : null
}

/** How long a hover waits before bringing the page, read like every attribute; a value that is not a whole number of ms is reported and the default stands. */
function delayOf(link: Element): number {
  const value = inherited(link, DELAY_ROLE)
  if (value === null) return HOVER_DELAY
  const ms = Number(value.trim())
  if (Number.isInteger(ms) && ms >= 0) return ms
  reportError(
    new Error(
      `bridge: data-bridge-${DELAY_ROLE}="${value}" is not a number of milliseconds`,
    ),
  )
  return HOVER_DELAY
}

/** The visitor asked for less data, or the network can barely carry a page: nothing is brought ahead. */
function savingData(): boolean {
  const connection = (navigator as Navigator & { connection?: Connection })
    .connection
  if (!connection) return false
  return (
    connection.saveData === true || /2g/.test(connection.effectiveType ?? '')
  )
}

interface Connection {
  saveData?: boolean
  effectiveType?: string
}

/** Milliseconds a hover waits by default: what instant.page measured as the point where a passing cursor no longer counts. */
const HOVER_DELAY = 80

/** The attribute's suffix after `data-bridge-`. */
const DELAY_ROLE = 'prefetch-delay'

/**
 * The browser's own prefetch for links bridge leaves to it, one rule set
 * per eagerness. Browsers read a rule set once, when its script enters the
 * document, so a changed set is a fresh script in place of the old one.
 * A new body is a new page: the sets start over with it, not with every
 * link the tab has seen. The script is inline: a Content Security Policy
 * must allow it with `'inline-speculation-rules'` in `script-src`, or
 * the browser drops the rules (and says so in its console).
 */
class SpeculationRules {
  private urls = this.empty()

  private empty() {
    return {
      conservative: new Set<string>(),
      moderate: new Set<string>(),
      eager: new Set<string>(),
    }
  }

  scan(root: ParentNode): void {
    if (root === document.body) this.urls = this.empty()
    const before = this.count()
    for (const link of root.querySelectorAll<HTMLAnchorElement>('a[href]')) {
      const eagerness = EAGERNESS[inherited(link, 'prefetch') ?? '']
      if (eagerness && optionsOf(link).target.kind === 'none')
        this.urls[eagerness].add(link.href)
    }
    if (this.count() !== before) this.write()
  }

  /** bridge stopped: its rules leave the page. */
  clear(): void {
    document.querySelector(`script[${OWNED}]`)?.remove()
  }

  private count(): number {
    return Object.values(this.urls).reduce((n, urls) => n + urls.size, 0)
  }

  private write(): void {
    const script = document.createElement('script')
    script.type = 'speculationrules'
    script.setAttribute(OWNED, '')
    script.textContent = JSON.stringify({ prefetch: this.rules() })
    document.querySelector(`script[${OWNED}]`)?.remove()
    document.head.append(script)
  }

  private rules(): object[] {
    return Object.entries(this.urls)
      .filter(([, urls]) => urls.size)
      .map(([eagerness, urls]) => ({
        source: 'list',
        urls: [...urls],
        eagerness,
      }))
  }
}

const OWNED = 'data-bridge-rules'

const EAGERNESS: Record<
  string,
  'conservative' | 'moderate' | 'eager' | undefined
> = {
  tap: 'conservative',
  hover: 'moderate',
  viewport: 'eager',
  eager: 'eager',
}
