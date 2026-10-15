import { announce } from './events'
import type { Loaded, Wanted } from './loader'

/**
 * What a navigation does when it can't finish (pattern: strategy), by
 * phase: `retry` when no response arrived, `land` when one did but its
 * segments couldn't be swapped. Nothing is ever sent again after a
 * response. `bridge:fail` goes first either way, with the `error` and,
 * once there is a response, its `page`, final `url` and `status`;
 * cancelling it leaves the page as it is.
 */
export interface Fallback {
  retry(error: unknown): void
  /** `again` brings the page another way (as the whole page); null when there is no other way but the browser. */
  land(loaded: Loaded, error: unknown, again: Again | null): Promise<void>
  /** The fallback of the landing itself: a GET of the page the response pointed at, which can fail in turn. */
  landing(wanted: Omit<Wanted, 'segments'>): Fallback
}

/**
 * Brings the page the response pointed at, another way (see
 * `Navigation.land`). `history` says how its entry is made; omitted, the
 * navigation's own way.
 */
export type Again = (history?: 'push' | 'replace') => Promise<void>

/**
 * For what the visitor asked for (a click, a submit): the page must end
 * up where the server said. No response: only an idempotent request is
 * repeated (RFC 9110 §9.2.2), the way the browser would — a GET (a link,
 * a search form, a landing) by loading its URL, the fields are in it. A
 * POST may have reached the server before the connection broke, so it is
 * never sent again on bridge's own: `bridge:fail` tells the page and the
 * form stays as it is, like the browser's error page lets the visitor
 * decide. A response that couldn't be swapped: the page it points at is
 * brought another way (as the whole page); when there is no other way,
 * the browser loads its URL as a plain GET.
 */
export class BrowserFallback implements Fallback {
  constructor(
    private readonly trigger: Element,
    private readonly wanted: Omit<Wanted, 'segments'>,
  ) {}

  retry(error: unknown): void {
    if (!failed(this.trigger, this.wanted, { error })) return
    if (this.wanted.method === 'GET') location.assign(this.wanted.url)
  }

  async land(
    loaded: Loaded,
    error: unknown,
    again: Again | null,
  ): Promise<void> {
    if (!failed(this.trigger, this.wanted, { error, ...loaded })) return
    if (again) await again()
    else location.assign(loaded.url)
  }

  landing(wanted: Omit<Wanted, 'segments'>): Fallback {
    return new BrowserFallback(this.trigger, wanted)
  }
}

/**
 * For a return by back/forward: the browser is already on the entry, so
 * whatever happens it is rewritten, never added to. No response: the
 * browser reloads the entry's URL in place. A response that couldn't be
 * swapped: the page it points at replaces the entry; when there is no
 * other way, the browser loads it in place.
 */
export class HistoryFallback implements Fallback {
  constructor(
    private readonly trigger: Element,
    private readonly wanted: Omit<Wanted, 'segments'>,
  ) {}

  retry(error: unknown): void {
    if (failed(this.trigger, this.wanted, { error }))
      location.replace(this.wanted.url)
  }

  async land(
    loaded: Loaded,
    error: unknown,
    again: Again | null,
  ): Promise<void> {
    if (!failed(this.trigger, this.wanted, { error, ...loaded })) return
    if (again) await again('replace')
    else location.replace(loaded.url)
  }

  landing(wanted: Omit<Wanted, 'segments'>): Fallback {
    return new HistoryFallback(this.trigger, wanted)
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

  retry(error: unknown): void {
    failed(this.trigger, this.wanted, { error })
    this.again()
  }

  async land(loaded: Loaded, error: unknown): Promise<void> {
    failed(this.trigger, this.wanted, { error, ...loaded })
    this.again()
  }

  /** Lazy content lands nowhere else, so this is never asked. */
  landing(): Fallback {
    return this
  }
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
