/**
 * Responses kept for a while, keyed by the URL that was fetched (segments
 * included): back/forward, prefetch and twins all read from here, so a
 * page is fetched once however many ways ask for it.
 */
export interface Cached {
  html: string
  /** Where the response came from after redirects, without `_segment`. */
  url: string
  status: number
}

export class ResponseCache {
  private readonly entries = new Map<string, Cached & { at: number }>()

  constructor(
    private readonly ttl: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get(key: string): Cached | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    if (this.now() - entry.at <= this.ttl) return entry
    this.entries.delete(key)
    return undefined
  }

  set(key: string, value: Cached): void {
    this.entries.set(key, { ...value, at: this.now() })
  }

  has(key: string): boolean {
    return this.get(key) !== undefined
  }
}
