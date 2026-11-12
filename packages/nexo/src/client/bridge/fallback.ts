import { announce } from './events'
import type { Loaded, Wanted } from './loader'
import type { Outcome } from './navigation'

/**
 * What a navigation does when it can't finish (pattern: strategy), by
 * phase: `retry` when no response arrived, `land` when one did but its
 * segments couldn't be swapped. Nothing is ever sent again after a
 * response. `bridge:fail` goes first either way, with the `error` and,
 * once there is a response, its `page`, final `url` and `status`;
 * cancelling it leaves the page as it is.
 */
export interface Fallback {
  /** No response came: `again` sends the same request once more (a keyed one, allowed to); null when it may not be. How it ended. */
  retry(error: unknown, again: Again | null): Promise<Outcome>
  /** `again` brings the page another way (as the whole page); null when there is no other way but the browser. How it ended. */
  land(loaded: Loaded, error: unknown, again: Again | null): Promise<Outcome>
  /** The fallback of the landing itself: a GET of the page the response pointed at, which can fail in turn. */
  landing(wanted: Omit<Wanted, 'segments'>): Fallback
  /** The page must come the browser's way: a tracked asset changed since this one loaded (a deploy). */
  outdated(url: URL): void
}

/**
 * Brings the page the response pointed at, another way (see
 * `Navigation.land`). `history` says how its entry is made; omitted, the
 * navigation's own way.
 */
export type Again = (history?: 'push' | 'replace') => Promise<Outcome>

/**
 * How the browser is sent somewhere when bridge gives up (pattern:
 * strategy): a visit adds an entry, a return by back/forward rewrites the
 * one the browser is already on, never adds to the stack it is travelling.
 */
export interface Arrival {
  go(url: URL): void
  /** How a landing makes its entry; undefined leaves it to the navigation. */
  history: 'replace' | undefined
}

export const VISIT: Arrival = {
  go: (url) => location.assign(url),
  history: undefined,
}

export const RETURN: Arrival = {
  go: (url) => location.replace(url),
  history: 'replace',
}

/**
 * For what the visitor asked for (a click, a submit, a return): the page
 * must end up where the server said. No response: only an idempotent
 * request is repeated (RFC 9110 §9.2.2), the way the browser would — a
 * GET (a link, a search form, a landing) by loading its URL, the fields
 * are in it. A POST may have reached the server before the connection
 * broke, so it is sent again only under its `Idempotency-Key`, which keep
 * answers once (keep's `idempotency`) — once, and quietly; after that `bridge:fail`
 * tells the page and the form stays as it is, like the browser's error
 * page lets the visitor decide. A response that couldn't be swapped: the page
 * it points at is brought another way (as the whole page); when there is
 * no other way, the browser loads its URL as a plain GET.
 */
export class BrowserFallback implements Fallback {
  constructor(
    private readonly trigger: Element,
    private readonly wanted: Omit<Wanted, 'segments'>,
    private readonly arrival: Arrival = VISIT,
  ) {}

  /** A keyed request goes once more, quietly; otherwise the page hears of it, and a GET is loaded by the browser. */
  async retry(error: unknown, again: Again | null): Promise<Outcome> {
    if (again) return again()
    if (!failed(this.trigger, this.wanted, { error })) return 'cancelled'
    if (this.wanted.method !== 'GET') return 'left'
    this.arrival.go(this.wanted.url)
    return 'left'
  }

  async land(
    loaded: Loaded,
    error: unknown,
    again: Again | null,
  ): Promise<Outcome> {
    if (!failed(this.trigger, this.wanted, { error, ...loaded }))
      return 'cancelled'
    if (again) return again(this.arrival.history)
    this.arrival.go(loaded.url)
    return 'left'
  }

  landing(wanted: Omit<Wanted, 'segments'>): Fallback {
    return new BrowserFallback(this.trigger, wanted, this.arrival)
  }

  /** The browser loads it the way the visitor arrived: a visit adds an entry, a return rewrites the one it is on. */
  outdated(url: URL): void {
    this.arrival.go(url)
  }
}

/**
 * For what the page asked for on its own (lazy content, a link followed
 * on sight): the visitor never asked, so nothing moves. `bridge:fail` is
 * announced, the placeholder stays, and `again` makes the element
 * eligible once more, so it is asked for again when it comes back into view.
 */
export class QuietFallback implements Fallback {
  constructor(
    private readonly trigger: Element,
    private readonly wanted: Omit<Wanted, 'segments'>,
    private readonly again: () => void,
  ) {}

  /** Lazy content is a GET: nothing to send again on its own; asked for again on sight instead. */
  async retry(error: unknown): Promise<Outcome> {
    failed(this.trigger, this.wanted, { error })
    this.again()
    return 'left'
  }

  async land(loaded: Loaded, error: unknown): Promise<Outcome> {
    failed(this.trigger, this.wanted, { error, ...loaded })
    this.again()
    return 'left'
  }

  /** Lazy content lands nowhere else, so this is never asked. */
  landing(): Fallback {
    return this
  }

  /** Lazy content is a fragment, which brings no head to be outdated by: never asked either. */
  outdated(): void {}
}

/** `bridge:fail` on the trigger; false when a listener cancelled it. */
function failed(
  trigger: Element,
  wanted: Omit<Wanted, 'segments'>,
  detail: object,
): boolean {
  const { url, method } = wanted
  return announce(trigger, 'bridge:fail', { url, method, ...detail })
}
