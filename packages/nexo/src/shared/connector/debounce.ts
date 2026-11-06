import { report } from './effect'
import { signal, type ReadonlyView, type Signal } from './signal'

export interface DebounceOptions {
  /** Also run on the first call of a burst, not only after it. */
  leading?: boolean
  /** Run at the latest after this long, even while calls keep coming. */
  maxWait?: number
  /** Aborting it drops what's waiting and ignores every later call. */
  signal?: AbortSignal
}

/** The wrapped function, plus how to drop or force what's waiting. */
export interface Debounced<A extends unknown[]> {
  (...args: A): void
  /** Drop the call that's waiting. */
  cancel(): void
  /** Run the call that's waiting now, if there is one. */
  flush(): void
  /** True while a call is waiting: "saving…" in the UI. */
  readonly pending: ReadonlyView<boolean>
}

/**
 * The timers of one debounced function (R.8). Each call restarts the wait;
 * the last call's arguments run when it ends, or at `maxWait`.
 */
class Debouncer<A extends unknown[]> {
  readonly waiting: Signal<boolean> = signal(false)
  private args?: A
  private timer?: ReturnType<typeof setTimeout>
  private maxTimer?: ReturnType<typeof setTimeout>

  constructor(
    private readonly fn: (...args: A) => unknown,
    private readonly ms: number,
    private readonly options: DebounceOptions,
  ) {
    options.signal?.addEventListener('abort', () => this.cancel(), {
      once: true,
    })
  }

  call(args: A): void {
    if (this.options.signal?.aborted) return
    const burstStarts = this.timer === undefined
    this.restart()
    if (burstStarts && this.options.leading) return this.run(args)
    this.hold(args)
  }

  flush(): void {
    const args = this.args
    this.stop()
    if (args) this.run(args)
  }

  cancel(): void {
    this.stop()
  }

  private hold(args: A): void {
    this.args = args
    this.waiting.set(true)
    this.startMaxWait()
  }

  private restart(): void {
    clearTimeout(this.timer)
    this.timer = setTimeout(() => this.flush(), this.ms)
  }

  private startMaxWait(): void {
    const { maxWait } = this.options
    if (maxWait === undefined || this.maxTimer !== undefined) return
    this.maxTimer = setTimeout(() => this.flush(), maxWait)
  }

  private stop(): void {
    clearTimeout(this.timer)
    clearTimeout(this.maxTimer)
    this.timer = this.maxTimer = this.args = undefined
    this.waiting.set(false)
  }

  /** It runs from a timer: an error is reported, as an effect's (E.1). */
  private run(args: A): void {
    try {
      this.fn(...args)
    } catch (error) {
      report(error)
    }
  }
}

/**
 * Wait until calls stop for `ms`, then run the last one (R.8). Works for any
 * function: a `watch` callback, a DOM handler, an event listener.
 *
 *   watch(search, debounce(load, 300, { maxWait: 1000 }))
 *   input.oninput = debounce(save, 500)
 */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => unknown,
  ms: number,
  options: DebounceOptions = {},
): Debounced<A> {
  const timers = new Debouncer(fn, ms, options)
  const debounced = (...args: A) => timers.call(args)
  return Object.assign(debounced, {
    cancel: () => timers.cancel(),
    flush: () => timers.flush(),
    pending: timers.waiting.asReadonly(),
  })
}
