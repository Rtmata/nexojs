/**
 * Decides when a dirty effect runs (pattern: strategy). Being called is the
 * "this is dirty" notice; it returns how to cancel. Write your own freely.
 */
export interface Scheduler {
  schedule(run: () => void): () => unknown
  /** Only for those that can block the thread: true while looping out of control. */
  exhausted?(): boolean
}

/** Effects that keep waking each other within one turn, as Preact's figure. */
export const DEFAULT_LIMIT = 100

/**
 * Runs what's queued in passes, one turn of the event loop at most. These are
 * the schedulers that could hang the page if effects wake each other forever,
 * so they count passes, and an effect past `limit` is stopped with an error.
 */
class Queue implements Scheduler {
  limit = DEFAULT_LIMIT
  private readonly waiting = new Set<() => void>()
  private passes = 0
  private draining = false

  constructor(private readonly start: (drain: () => void) => void) {}

  schedule(run: () => void): () => unknown {
    const wasIdle = this.waiting.size === 0 && !this.draining
    this.waiting.add(run)
    if (wasIdle) this.start(() => this.drain())
    return () => this.waiting.delete(run)
  }

  exhausted(): boolean {
    return this.passes > this.limit
  }

  private drain(): void {
    this.draining = true
    try {
      while (this.waiting.size > 0) this.pass()
    } finally {
      this.draining = false
      this.passes = 0
    }
  }

  private pass(): void {
    this.passes++
    const runs = [...this.waiting]
    this.waiting.clear()
    for (const run of runs) run()
  }
}

/** The default: after the current code, before the browser paints. */
export const microtask = new Queue(queueMicrotask)

/** Right away, as soon as the write's batch ends. */
export const sync = new Queue((drain) => drain())

/** Once per animation frame. Needs a browser: there are no frames elsewhere. */
export const frame: Scheduler = {
  schedule(run) {
    if (typeof requestAnimationFrame === 'undefined')
      throw new Error(
        `connector: the frame scheduler needs a browser. Use later(16) where there's no requestAnimationFrame`,
      )
    const id = requestAnimationFrame(() => run())
    return () => cancelAnimationFrame(id)
  },
}

/** After `ms` milliseconds, everywhere. */
export function later(ms: number): Scheduler {
  return {
    schedule(run) {
      const id = setTimeout(run, ms)
      return () => clearTimeout(id)
    },
  }
}

class Throttle implements Scheduler {
  private lastRun = -Infinity

  constructor(private readonly ms: number) {}

  schedule(run: () => void): () => unknown {
    const wait = Math.max(0, this.lastRun + this.ms - Date.now())
    const id = setTimeout(() => this.runNow(run), wait)
    return () => clearTimeout(id)
  }

  private runNow(run: () => void): void {
    this.lastRun = Date.now()
    run()
  }
}

/** At most once every `ms`: the first change runs at once, the rest wait their turn. */
export function throttle(ms: number): Scheduler {
  return new Throttle(ms)
}

/** A scheduler that can say whether it's the real thing. */
export interface IdleScheduler extends Scheduler {
  /** False where there's no `requestIdleCallback` (WebKit, Bun): it's `later(1)` there. */
  readonly native: boolean
}

const hasIdle = typeof requestIdleCallback !== 'undefined'

/** When the browser is idle, or `later(1)` where it can't say. See `native`. */
export const idle: IdleScheduler = hasIdle
  ? {
      native: true,
      schedule(run) {
        const id = requestIdleCallback(() => run())
        return () => cancelIdleCallback(id)
      },
    }
  : { native: false, ...later(1) }

/** A scheduler you run by hand, for tests. */
export class ManualScheduler implements Scheduler {
  private readonly waiting = new Set<() => void>()

  schedule(run: () => void): () => unknown {
    this.waiting.add(run)
    return () => this.waiting.delete(run)
  }

  run(): void {
    const runs = [...this.waiting]
    this.waiting.clear()
    for (const run of runs) run()
  }
}

/**
 * Nothing runs until you say so:
 *
 *   const m = manual()
 *   effect(fn, { scheduler: m })
 *   m.run()
 */
export function manual(): ManualScheduler {
  return new ManualScheduler()
}
