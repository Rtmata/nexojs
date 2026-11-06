import { whenSettled } from './batch'
import { microtask, type Scheduler } from './schedulers'
import {
  Dependencies,
  label,
  reading,
  Source,
  type Named,
  type Observer,
} from './source'

export interface RunContext {
  /** Aborted just before the next run and when the effect ends. */
  signal: AbortSignal
}

export type EffectBody = (run: RunContext) => unknown

export interface EffectOptions extends Named {
  /** When it runs after a change. `microtask` by default. */
  scheduler?: Scheduler
  /** Aborting it ends the effect, along with whatever else shares the signal. */
  signal?: AbortSignal
  /** Where its errors go. By default they're reported, and nothing stops. */
  onError?: (error: unknown) => void
}

/** Ends an effect. */
export type Dispose = () => void

/**
 * `reportError` reaches `window.onerror` and tools listening there, but ends a
 * Bun or Node process with no handler, and a server must never fall over.
 */
export function report(error: unknown): void {
  if (typeof window !== 'undefined') reportError(error)
  else console.error(error)
}

/** Effects waiting on a scheduler, in order, for `flush` to find them. */
const pending = new Set<EffectNode>()

/**
 * Runs a function again when what it read changes. Every run goes through its
 * scheduler, the first too. An error ends the run, not the effect: it stays
 * subscribed and runs on the next change.
 */
export class EffectNode implements Observer {
  readonly pure = false
  readonly name?: string
  readonly label: string
  private readonly dependencies = new Dependencies(this)
  private readonly scheduler: Scheduler
  private readonly onError: (error: unknown) => void
  private readonly controller = new AbortController()
  private run?: AbortController
  private cancel?: () => unknown
  private stale = false
  private started = false

  constructor(
    private readonly body: EffectBody,
    options: EffectOptions = {},
  ) {
    this.name = options.name
    this.label = label('effect', options.name)
    this.scheduler = options.scheduler ?? microtask
    this.onError = options.onError ?? report
    this.dependencies.connect()
    options.signal?.addEventListener('abort', this.dispose, {
      once: true,
      signal: this.controller.signal,
    })
    if (options.signal?.aborted) this.dispose()
  }

  private get ended(): boolean {
    return this.controller.signal.aborted
  }

  /** Whether `flush` should keep going for it: only schedulers that can loop. */
  get settlesInTurn(): boolean {
    return this.scheduler.limit !== undefined
  }

  /** Have the scheduler run it for the first time. */
  begin(): void {
    this.mark()
  }

  /** The first run right now, to read sources before anything can change. */
  beginNow(): void {
    this.perform()
  }

  mark(): void {
    if (this.stale || this.ended) return
    this.stale = true
    whenSettled(this.notify)
  }

  depend(source: Source): void {
    this.dependencies.add(source)
  }

  /** Skip the wait. */
  runNow(): void {
    this.withdraw()
    this.runIfChanged()
  }

  /** One pass of `flush`: past its scheduler's limit, it's looping. */
  flushPass(pass: number): void {
    if (pass > (this.scheduler.limit ?? Infinity)) this.fail()
    else this.runNow()
  }

  /** It's looping: this run becomes an error instead. */
  fail(): void {
    this.withdraw()
    this.stale = false
    this.handle(this.looping(), this.run)
  }

  readonly dispose: Dispose = () => {
    this.withdraw()
    this.stale = false
    this.run?.abort()
    this.controller.abort()
    this.dependencies.disconnect()
  }

  sources(): Source[] {
    return this.dependencies.list()
  }

  /** A `sync` scheduler fires inside `schedule`: by then there's nothing to cancel. */
  private readonly notify = (): void => {
    if (this.ended || !this.stale || pending.has(this)) return
    pending.add(this)
    const cancel = this.scheduler.schedule(this.fire)
    if (pending.has(this)) this.cancel ??= cancel
  }

  private readonly fire = (): void => {
    if (this.scheduler.exhausted?.()) this.fail()
    else this.runNow()
  }

  private withdraw(): void {
    this.cancel?.()
    this.cancel = undefined
    pending.delete(this)
  }

  private runIfChanged(): void {
    if (this.ended) return
    this.stale = false
    if (!this.started || this.dependencies.changed()) this.perform()
  }

  private perform(): void {
    const run = this.nextRun()
    this.dependencies.begin()
    try {
      this.settle(this.callBody(run), run)
    } catch (error) {
      this.handle(error, run)
    } finally {
      this.dependencies.end()
    }
  }

  private nextRun(): AbortController {
    this.started = true
    this.run?.abort()
    this.run = new AbortController()
    return this.run
  }

  private callBody(run: AbortController): unknown {
    return reading(this, () => this.body(run))
  }

  /** A returned function is cleanup; a returned promise can still fail. */
  private settle(result: unknown, run: AbortController): void {
    if (typeof result === 'function') this.cleanUp(result, run)
    else if (isThenable(result))
      result.then(undefined, (error) => this.rejected(error, run))
  }

  private cleanUp(cleanup: Function, run: AbortController): void {
    const safely = () => {
      try {
        cleanup()
      } catch (error) {
        this.handle(error, run)
      }
    }
    run.signal.addEventListener('abort', safely, { once: true })
  }

  /** The cancellation the run itself asked for isn't an error. */
  private rejected(error: unknown, run: AbortController): void {
    if (isOwnCancel(run.signal, error)) return
    this.handle(error, run)
  }

  /**
   * An error ends the run it came from, and only that one: its cleanup
   * happens first. An `onError` that throws goes to `report`.
   */
  private handle(error: unknown, run?: AbortController): void {
    run?.abort()
    try {
      this.onError(error)
    } catch (second) {
      report(second)
    }
  }

  private looping(): Error {
    return new Error(
      `connector: ${this.label} was stopped: effects keep waking each other. An effect probably writes something it reads: use untrack(), or the frame scheduler if it's an animation`,
    )
  }
}

/** Anything with a `then`, not only this realm's `Promise`. */
function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof (value as PromiseLike<unknown> | null)?.then === 'function'
}

/** What `fetch` and `throwIfAborted()` reject with when their signal aborts. */
function isOwnCancel(signal: AbortSignal, error: unknown): boolean {
  return signal.aborted && error === signal.reason
}

const nodes = new WeakMap<Dispose, EffectNode>()

/**
 * Runs `fn` now-ish and again when what it reads changes. Returns how to end it.
 *
 *   const stop = effect(({ signal }) => {
 *     window.addEventListener('resize', layout, { signal })
 *     title.textContent = name.get()
 *   })
 */
export function effect(fn: EffectBody, options?: EffectOptions): Dispose {
  const node = new EffectNode(fn, options)
  node.begin()
  return remember(node)
}

/** Lets `sources(stop)` find the effect behind the function you hold. */
export function remember(node: EffectNode): Dispose {
  nodes.set(node.dispose, node)
  return node.dispose
}

export function nodeOf(dispose: Dispose): EffectNode | undefined {
  return nodes.get(dispose)
}

/**
 * Run everything pending now, in order, instead of when its scheduler would,
 * until effects stop waking each other; each one is stopped past its own
 * scheduler's `limit`. A `frame` or `later` effect runs once: writing to
 * itself there is an animation, not a loop.
 */
export function flush(): void {
  let due = [...pending]
  for (let pass = 1; due.length > 0; pass++) {
    for (const node of due) node.flushPass(pass)
    due = [...pending].filter((node) => node.settlesInTurn)
  }
}
