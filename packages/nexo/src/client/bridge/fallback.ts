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
  /** `take` puts the response in another way; null when there is no other way but the browser. */
  land(loaded: Loaded, error: unknown, take: Take | null): Promise<void>
}

/** Puts a loaded page in another way (the whole page, see `Navigation.take`). */
export type Take = (loaded: Loaded) => Promise<void>

/**
 * For what the visitor asked for (a click, a submit): the page must end
 * up where the server said. No response: the browser repeats the request
 * its own way (the form submitted, the link followed), safe since nothing
 * was sent. A response that couldn't be swapped is put in another way
 * (the whole page in place); if that fails too, or there is no other way,
 * the browser loads its URL as a plain GET.
 */
export class BrowserFallback implements Fallback {
  constructor(
    private readonly trigger: Element,
    private readonly wanted: Omit<Wanted, 'segments'>,
  ) {}

  retry(error: unknown): void {
    if (!failed(this.trigger, this.wanted, { error })) return
    if (this.trigger instanceof HTMLFormElement) this.trigger.submit()
    else location.assign(this.wanted.url)
  }

  async land(loaded: Loaded, error: unknown, take: Take | null): Promise<void> {
    if (!failed(this.trigger, this.wanted, { error, ...loaded })) return
    if (!take) return location.assign(loaded.url)
    await take(loaded).catch(() => location.assign(loaded.url))
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
