/** What keep keeps under a key: the request's fingerprint and, once the handler answered, its response. */
export interface Recorded {
  /** Method, URL and body hashed: the same key must bring the same request. */
  fingerprint: string
  /** Null while the first request is still being answered. */
  response: RecordedResponse | null
}

export interface RecordedResponse {
  status: number
  headers: [string, string][]
  body: Uint8Array | null
}

/**
 * Where keep's idempotency keeps its recordings. One process needs nothing but memory;
 * several share one through anything with these three methods (a Redis
 * client behind a small adapter). `ttl` is milliseconds from now.
 */
export interface IdempotencyStore {
  get(key: string): Recorded | undefined | Promise<Recorded | undefined>
  set(key: string, recorded: Recorded, ttl: number): void | Promise<void>
  delete(key: string): void | Promise<void>
}

/** Recordings in memory, each gone once its time is over; the dead are swept on every write. */
export class MemoryStore implements IdempotencyStore {
  private readonly entries = new Map<
    string,
    { recorded: Recorded; until: number }
  >()

  constructor(private readonly now: () => number = () => Date.now()) {}

  get(key: string): Recorded | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    if (entry.until > this.now()) return entry.recorded
    this.entries.delete(key)
    return undefined
  }

  set(key: string, recorded: Recorded, ttl: number): void {
    this.sweep()
    this.entries.set(key, { recorded, until: this.now() + ttl })
  }

  delete(key: string): void {
    this.entries.delete(key)
  }

  private sweep(): void {
    const now = this.now()
    for (const [key, entry] of this.entries)
      if (entry.until <= now) this.entries.delete(key)
  }
}
