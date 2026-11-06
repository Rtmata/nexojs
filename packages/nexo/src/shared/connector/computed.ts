import { readonlyView, type Readable, type ReadonlyView } from './signal'
import {
  current,
  Dependencies,
  reading,
  Source,
  untrack,
  type Named,
  type Observer,
} from './source'

export interface ComputedOptions<T> extends Named {
  /** When a new result counts as the same one. `Object.is` by default. */
  equals?: (previous: T, next: T) => boolean
}

/** A node's result is a value or an error; reading delivers whichever it holds. */
type Result<T> = { value: T } | { error: unknown }

/**
 * A value worked out from others, only when read and only if they changed. An
 * error is its result too: it's kept and thrown to whoever reads, until a
 * source changes. Nobody observing it means it isn't linked into its sources,
 * so they don't keep it alive.
 */
export class Computed<T>
  extends Source
  implements Observer, Readable<T>, ReadonlyView<T>
{
  readonly pure = true
  private readonly dependencies = new Dependencies(this)
  private readonly equals: (previous: T, next: T) => boolean
  private result?: Result<T>
  private view?: ReadonlyView<T>
  private stale = false
  private computing = false
  private checkedAt = -1

  constructor(
    private readonly fn: () => T,
    options: ComputedOptions<T> = {},
  ) {
    super('computed', options.name)
    this.equals = options.equals ?? Object.is
  }

  get(): T {
    this.refresh()
    this.track()
    return deliver(this.result!)
  }

  /** Exactly `untrack(() => c.get())`. */
  peek(): T {
    return untrack(() => this.get())
  }

  toJSON(): T {
    return this.peek()
  }

  /** The same node, typed for reading. Made once. */
  asReadonly(): ReadonlyView<T> {
    this.view ??= readonlyView(this)
    return this.view
  }

  refresh(): void {
    if (this.computing) throw this.cycle()
    if (this.isFresh()) return
    if (!this.result || this.dependencies.changed()) this.recompute()
    this.stale = false
    this.checkedAt = current.clock
  }

  mark(): void {
    if (this.stale) return
    this.stale = true
    this.markObservers()
  }

  depend(source: Source): void {
    this.dependencies.add(source)
  }

  override subscribe(observer: Observer): void {
    if (this.observers.size === 0) this.goLive()
    super.subscribe(observer)
  }

  override unsubscribe(observer: Observer): void {
    super.unsubscribe(observer)
    if (this.observers.size === 0) this.dependencies.disconnect()
  }

  /** What it read in its last run. */
  sources(): Source[] {
    return this.dependencies.list()
  }

  private isFresh(): boolean {
    if (!this.result) return false
    return this.observers.size > 0
      ? !this.stale
      : this.checkedAt === current.clock
  }

  private goLive(): void {
    this.dependencies.connect()
    this.stale = this.checkedAt !== current.clock
  }

  private recompute(): void {
    const next = this.run()
    if (this.isSameResult(next)) return
    this.result = next
    this.version++
  }

  private run(): Result<T> {
    this.computing = true
    this.dependencies.begin()
    try {
      return { value: reading(this, this.fn) }
    } catch (error) {
      return { error } // what it read before throwing stays, so it can recover
    } finally {
      this.dependencies.end()
      this.computing = false
    }
  }

  /** `equals` is about values: to or from an error always counts as a change. */
  private isSameResult(next: Result<T>): boolean {
    const previous = this.result
    if (!previous || 'error' in previous || 'error' in next) return false
    return this.equals(previous.value, next.value)
  }

  private cycle(): Error {
    return new Error(
      `connector: ${this.label} reads itself while it runs. Break the cycle between its sources`,
    )
  }
}

/**
 * A value worked out from others:
 *
 *   const total = computed(() => price.get() * quantity.get())
 */
export function computed<T>(
  fn: () => T,
  options?: ComputedOptions<T>,
): Computed<T> {
  return new Computed(fn, options)
}

function deliver<T>(result: Result<T>): T {
  if ('error' in result) throw result.error
  return result.value
}
