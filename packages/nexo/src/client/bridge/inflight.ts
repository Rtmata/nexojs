import { announce } from './events'

/**
 * Requests in progress, one per target. A new request to a target aborts
 * the one still running there (`bridge:cancel` on its trigger); different
 * targets run side by side; a full-page navigation aborts them all. While
 * a request runs, its targets carry `aria-busy="true"` and its trigger
 * `data-bridge-active`, so the site's CSS can show it.
 */
export class Inflight {
  private readonly flights = new Map<string, Flight>()

  start(targets: string[], trigger: Element, busy: Element[]): Flight {
    for (const name of targets) this.flights.get(name)?.cancel()
    const flight = new Flight(trigger, busy, () => this.forget(flight))
    for (const name of targets) this.flights.set(name, flight)
    return flight
  }

  abortAll(): void {
    for (const flight of new Set(this.flights.values())) flight.cancel()
  }

  private forget(flight: Flight): void {
    for (const [name, f] of this.flights)
      if (f === flight) this.flights.delete(name)
  }
}

export class Flight {
  private readonly controller = new AbortController()
  private ended = false

  constructor(
    private readonly trigger: Element,
    private readonly busy: Element[],
    private readonly onEnd: () => void,
  ) {
    trigger.setAttribute(ACTIVE, '')
    for (const element of busy) element.setAttribute('aria-busy', 'true')
  }

  get signal(): AbortSignal {
    return this.controller.signal
  }

  get aborted(): boolean {
    return this.controller.signal.aborted
  }

  /** Clears the marks once; a cancelled flight that later settles changes nothing. */
  end(): void {
    if (this.ended) return
    this.ended = true
    this.trigger.removeAttribute(ACTIVE)
    for (const element of this.busy) element.removeAttribute('aria-busy')
    this.onEnd()
  }

  cancel(): void {
    if (this.aborted) return
    this.controller.abort()
    announce(this.trigger, 'bridge:cancel', {})
    this.end()
  }
}

/** Set on the link or form while its request runs. */
export const ACTIVE = 'data-bridge-active'
