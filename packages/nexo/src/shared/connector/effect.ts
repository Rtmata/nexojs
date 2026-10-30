import { whenSettled } from './batch'
import { DEFAULT_LIMIT, microtask, type Scheduler } from './schedulers'
import { Dependencies, reading, Source, type Observer } from './source'

export interface RunContext {
  /** Aborted just before the next run and when the effect ends. */
  signal: AbortSignal
}

export type EffectBody = (run: RunContext) => unknown

export interface EffectOptions {
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
    return this.scheduler.exhausted !== undefined
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

  /** What `flush` does: skip the wait. */
  runNow(): void {
    this.withdraw()
    this.runIfChanged()
  }

  /** It's looping: this run becomes an error instead. */
  fail(error: unknown): void {
    this.withdraw()
    this.stale = false
    this.handle(error)
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
    if (this.scheduler.exhausted?.()) this.fail(tooManyRuns())
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
      this.settle(this.callBody(run), run.signal)
    } catch (error) {
      this.handle(error)
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
  private settle(result: unknown, signal: AbortSignal): void {
    if (typeof result === 'function') this.cleanUp(result, signal)
    else if (result instanceof Promise)
      result.catch((error) => this.handle(error))
  }

  private cleanUp(cleanup: Function, signal: AbortSignal): void {
    const safely = () => {
      try {
        cleanup()
      } catch (error) {
        this.handle(error)
      }
    }
    signal.addEventListener('abort', safely, { once: true })
  }

  /** The run's cleanup happens first; an `onError` that throws goes to `report`. */
  private handle(error: unknown): void {
    this.run?.abort()
    try {
      this.onError(error)
    } catch (second) {
      report(second)
    }
  }
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
 * until effects stop waking each other. A `frame` or `later` effect runs once:
 * writing to itself there is an animation, not a loop.
 */
export function flush(): void {
  let due = [...pending]
  for (let pass = 1; due.length > 0; pass++) {
    if (pass > DEFAULT_LIMIT) return failAll(due)
    for (const node of due) node.runNow()
    due = [...pending].filter((node) => node.settlesInTurn)
  }
}

function failAll(nodes: EffectNode[]): void {
  for (const node of nodes) node.fail(tooManyRuns())
}

function tooManyRuns(): Error {
  return new Error(
    `connector: effects keep waking each other, so they were stopped. An effect probably writes something it reads: use untrack(), or the frame scheduler if it's an animation`,
  )
}
