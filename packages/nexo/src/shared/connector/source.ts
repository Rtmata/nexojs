/** Something that depends on sources: a computed or an effect. */
export interface Observer {
  /** A source may have changed: note it, and pass it on. */
  mark(): void
  /** A source was read while this observer ran. */
  depend(source: Source): void
  /** Computeds are pure: writing a signal while one runs is an error. */
  readonly pure: boolean
  /** How errors name it. */
  readonly label: string
}

/** Every node can carry a name, for errors and for inspecting. */
export interface Named {
  /** Shown in errors and by `sources()`. */
  name?: string
}

const ARTICLES = {
  signal: 'a signal',
  computed: 'a computed',
  effect: 'an effect',
  event: 'an event',
}

/** How errors name a node: `computed "total"`, or `a computed` with no name. */
export function label(kind: keyof typeof ARTICLES, name?: string): string {
  return name === undefined ? ARTICLES[kind] : `${kind} "${name}"`
}

/**
 * The one piece of module-level state in connector: who is reading right now.
 * It's set around a synchronous call and restored right after, never held
 * across an `await`, so concurrent requests can't see each other. A read after
 * an `await` isn't tracked. `clock` counts every write to any signal, so a
 * computed nobody observes knows when nothing can have changed.
 */
export const current = {
  observer: null as Observer | null,
  clock: 0,
}

/**
 * A node others can depend on. `version` changes only when its result does,
 * which is what lets a change stop spreading (pattern: observer, push-pull:
 * writes only mark, values are worked out when read).
 */
export abstract class Source {
  readonly observers = new Set<Observer>()
  readonly label: string
  version = 0

  constructor(
    kind: 'signal' | 'computed',
    readonly name?: string,
  ) {
    this.label = label(kind, name)
  }

  /** Bring the result up to date. A signal always is. */
  abstract refresh(): void

  subscribe(observer: Observer): void {
    this.observers.add(observer)
  }

  unsubscribe(observer: Observer): void {
    this.observers.delete(observer)
  }

  protected track(): void {
    current.observer?.depend(this)
  }

  protected markObservers(): void {
    for (const observer of this.observers) observer.mark()
  }
}

/** Run `fn` with `observer` as the one reading, whatever it reads depends on. */
export function reading<T>(observer: Observer | null, fn: () => T): T {
  const previous = current.observer
  current.observer = observer
  try {
    return fn()
  } finally {
    current.observer = previous
  }
}

/**
 * Run `fn` without tracking what it reads:
 *
 *   computed(() => a.get() + untrack(() => b.get()))   // doesn't depend on b
 */
export function untrack<T>(fn: () => T): T {
  return reading(null, fn)
}

/**
 * The sources one observer read in its last run, each with the version it saw.
 * `live` means the observer is linked into them and hears about changes; a
 * computed nobody observes isn't, so sources never keep it alive.
 */
export class Dependencies {
  private seen = new Map<Source, number>()
  private previous = new Map<Source, number>()
  private live = false

  constructor(private readonly owner: Observer) {}

  /** A run starts: what it reads replaces what the last one read. */
  begin(): void {
    this.previous = this.seen
    this.seen = new Map()
  }

  add(source: Source): void {
    this.seen.set(source, source.version)
    if (this.live) source.subscribe(this.owner)
  }

  /** A run ended: stop hearing from what it no longer reads. */
  end(): void {
    if (this.live) this.dropUnread()
    this.previous = new Map()
  }

  /** In read order, stopping early: a branch no longer taken isn't worked out. */
  changed(): boolean {
    for (const [source, version] of this.seen) {
      source.refresh()
      if (source.version !== version) return true
    }
    return false
  }

  connect(): void {
    this.live = true
    for (const source of this.seen.keys()) source.subscribe(this.owner)
  }

  disconnect(): void {
    this.live = false
    for (const source of this.seen.keys()) source.unsubscribe(this.owner)
  }

  list(): Source[] {
    return [...this.seen.keys()]
  }

  private dropUnread(): void {
    for (const source of this.previous.keys())
      if (!this.seen.has(source)) source.unsubscribe(this.owner)
  }
}
