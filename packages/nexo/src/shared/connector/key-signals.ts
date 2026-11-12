import { signal, type Signal } from './signal'

/**
 * One plain signal per key, made the first time someone reads that key. The
 * collections are built of these and one `shape` signal, and notify only by
 * writing them: there's no notify of their own.
 */
export class KeySignals<K, V> {
  private readonly signals = new Map<K, Signal<V>>()

  read(key: K, now: V): V {
    return this.of(key, now).get()
  }

  write(key: K, value: V): void {
    this.signals.get(key)?.set(value)
  }

  /** Every key someone read gets its value again, from `valueOf`. */
  writeAll(valueOf: (key: K) => V): void {
    for (const [key, cell] of this.signals) cell.set(valueOf(key))
  }

  /** The key left: its readers hear `last` once, then it's forgotten. */
  drop(key: K, last: V): void {
    this.write(key, last)
    this.signals.delete(key)
  }

  dropAll(last: V): void {
    for (const key of [...this.signals.keys()]) this.drop(key, last)
  }

  private of(key: K, now: V): Signal<V> {
    let cell = this.signals.get(key)
    if (!cell) this.signals.set(key, (cell = signal(now)))
    return cell
  }
}

/** Counts changes to what a collection holds; reading it tracks them. */
export class Shape {
  private readonly changes = signal(0)

  track(): void {
    this.changes.get()
  }

  changed(): void {
    this.changes.update((n) => n + 1)
  }
}
