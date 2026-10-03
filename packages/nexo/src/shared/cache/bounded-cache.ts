/**
 * A cache that keeps only the newest `limit` entries (pattern: LRU), so
 * values made from outside input — a visitor's language tag, options
 * built per request — can never grow memory without end.
 *
 *   const formats = new BoundedCache<string, Intl.NumberFormat>(64)
 *   formats.remember('es', () => new Intl.NumberFormat('es'))
 */
export class BoundedCache<K, V> {
  private readonly entries = new Map<K, V>()

  constructor(private readonly limit: number) {}

  /**
   * Remember the value for `key` — made with `make` the first time, or
   * after it was dropped — mark it the newest, and give it back. A command
   * that answers, as a memo must be.
   */
  remember(key: K, make: () => V): V {
    const value = this.entries.has(key) ? this.entries.get(key)! : make()
    this.entries.delete(key) // re-inserted below: now the newest
    this.entries.set(key, value)
    if (this.entries.size > this.limit) this.dropOldest()
    return value
  }

  private dropOldest(): void {
    this.entries.delete(this.entries.keys().next().value!)
  }
}
