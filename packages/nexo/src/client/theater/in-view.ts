import { listOf, type Targets } from './targets'

/** What `inView` hears: the entry, and the visit's own signal. */
export type Visit = (
  entry: IntersectionObserverEntry,
  visit: { signal: AbortSignal },
) => void

export interface InViewOptions {
  /** What counts as the viewport. The page's by default. */
  root?: Element | Document
  /** Grows or shrinks the root, as CSS margins: `'0px 0px -20% 0px'`. */
  margin?: string
  /** How much must show: `'some'` (any pixel), `'all'`, or 0 to 1. `'some'` by default. */
  amount?: 'some' | 'all' | number
  /** Only the first visit. */
  once?: boolean
  /** Aborting stops watching, and ends a visit in progress. */
  signal?: AbortSignal
}

function thresholdOf(amount: InViewOptions['amount'] = 'some'): number {
  if (amount === 'some') return 0
  if (amount === 'all') return 1
  return amount
}

/**
 * One element's visits: each time it comes in, a new signal; when it
 * leaves (or everything stops), that signal aborts.
 */
class Visits {
  private visit: AbortController | null = null

  constructor(
    private readonly enter: Visit,
    private readonly threshold: number,
  ) {}

  /** Starts a visit when the entry is inside, ends it when outside. */
  seen(entry: IntersectionObserverEntry): void {
    const inside =
      entry.isIntersecting && entry.intersectionRatio >= this.threshold
    if (inside && !this.visit) this.start(entry)
    if (!inside) this.end()
  }

  end(): void {
    this.visit?.abort()
    this.visit = null
  }

  /**
   * `enter` is the page's code, called by the browser: a throw is reported
   * (as the frame loop does) and the rest of the batch still runs. The
   * visit stays started, so whatever `enter` hooked to its signal before
   * throwing still ends when the element leaves.
   */
  private start(entry: IntersectionObserverEntry): void {
    this.visit = new AbortController()
    try {
      this.enter(entry, { signal: this.visit.signal })
    } catch (error) {
      reportError(error)
    }
  }
}

/**
 * Runs `enter` each time an element comes into view, over an
 * IntersectionObserver. Each visit gets a signal that aborts when the
 * element leaves: whatever was started with it (an animation, a scroll
 * link, a fetch) stops by itself.
 *
 *   inView(shelf, (entry, { signal }) => {
 *     animate(covers, { translate: ['0 0', '0 -6px'] }, { iterations: Infinity, direction: 'alternate', signal })
 *   }, { amount: 0.3, signal })
 */
export function inView(
  targets: Targets,
  enter: Visit,
  options: InViewOptions = {},
): void {
  if (options.signal?.aborted) return // stopped before it started: nothing to watch
  new Watch(listOf(targets), enter, options)
}

/** One IntersectionObserver over the elements, and each element's visits. */
class Watch {
  private readonly visits: Map<Element, Visits>
  private readonly observer: IntersectionObserver

  constructor(
    elements: Element[],
    enter: Visit,
    private readonly options: InViewOptions,
  ) {
    const threshold = thresholdOf(options.amount)
    const visits = (el: Element) =>
      new Visits(this.enterOf(el, enter), threshold)
    this.visits = new Map(elements.map((el) => [el, visits(el)]))
    this.observer = this.observerOf(threshold)
    for (const el of elements) this.observer.observe(el)
    options.signal?.addEventListener('abort', () => this.stop(), { once: true })
  }

  /** With `once`, the first visit also stops watching the element (even if `enter` throws). */
  private enterOf(el: Element, enter: Visit): Visit {
    if (!this.options.once) return enter
    return (entry, visit) => {
      this.observer.unobserve(el)
      enter(entry, visit)
    }
  }

  private observerOf(threshold: number): IntersectionObserver {
    const { root, margin: rootMargin } = this.options
    const seen = (entries: IntersectionObserverEntry[]) =>
      entries.forEach((e) => this.seen(e))
    return new IntersectionObserver(seen, { root, rootMargin, threshold })
  }

  private seen(entry: IntersectionObserverEntry): void {
    this.visits.get(entry.target)!.seen(entry)
  }

  private stop(): void {
    this.observer.disconnect()
    for (const visit of this.visits.values()) visit.end()
  }
}
