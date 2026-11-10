import { TOP } from '../../shared/bridge/vocabulary'
import { announce } from './events'

/**
 * Requests in progress, one per target. A new request to a target aborts
 * the one still running there (`bridge:cancel` on its trigger); different
 * targets run side by side. A whole page covers every target: asking for
 * it aborts them all, and asking for any of them aborts it. While
 * a request runs, its targets carry `aria-busy="true"` and its trigger
 * `data-active`, so the site's CSS can show it.
 */
export class Inflight {
  private readonly flights = new Map<string, Flight>()
  /** How many requests each target has seen start, and all of them together: a navigation can tell whether anything came after it. */
  private readonly started = new Map<string, number>()
  private all = 0

  start(targets: string[], trigger: Element, busy: Element[]): Flight {
    if (targets.includes(TOP)) this.abortAll()
    for (const name of [...targets, TOP]) this.flights.get(name)?.cancel()
    const flight = new Flight(trigger, busy, () => this.forget(flight))
    for (const name of targets) {
      this.flights.set(name, flight)
      this.started.set(name, (this.started.get(name) ?? 0) + 1)
    }
    this.all++
    return flight
  }

  /** The requests started on these targets so far: a whole page counts on every target, and every target counts on the whole page. */
  count(targets: string[]): number {
    if (targets.includes(TOP)) return this.all
    const names = [...targets, TOP]
    return names.reduce((n, name) => n + (this.started.get(name) ?? 0), 0)
  }

  /** Something is still running on one of these targets (a whole page covers them all). */
  running(targets: string[]): boolean {
    return [...targets, TOP].some((name) => this.flights.has(name))
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
  /** Aborted when the flight ends: what listens for it while it flies stops listening then. */
  private readonly over = new AbortController()
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

  /** The `{ signal }` rule: the caller's abort cancels it, as a newer navigation would — while it flies; the listener goes when it ends. */
  cancelsWith(signal?: AbortSignal): void {
    if (signal?.aborted) return this.cancel() // aborted meanwhile (a bridge:fetch listener): no event comes again
    const options = { once: true, signal: this.over.signal }
    signal?.addEventListener('abort', () => this.cancel(), options)
  }

  /** Clears the marks once; a cancelled flight that later settles changes nothing. */
  end(): void {
    if (this.ended) return
    this.ended = true
    this.over.abort()
    this.trigger.removeAttribute(ACTIVE)
    for (const element of this.busy) element.removeAttribute('aria-busy')
    this.onEnd()
  }

  /** `bridge:cancel` and the marks cleared; nothing once it ended: there is no request left to cancel. */
  cancel(): void {
    if (this.aborted || this.ended) return
    this.controller.abort()
    announce(this.trigger, 'bridge:cancel', {})
    this.end()
  }
}

/** Set on the link or form while its request runs: a state, so unprefixed (audit item 6b, as HTML's own states). */
export const ACTIVE = 'data-active'
