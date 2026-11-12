import type { Context, Handler } from '../../../shared/http/types'
import type { Middleware } from '../middleware'
import { fingerprintOf, recordingOf, replay } from './recording'
import { MemoryStore, type IdempotencyStore, type Recorded } from './store'
import { SAFE_METHODS } from '../safe-methods'
import { KEY_HEADER } from './vocabulary'

export interface IdempotencyOptions {
  /** Milliseconds a recording is kept; an hour (`60 * 60 * 1000`) by default: a retry comes within seconds, a reload within minutes. */
  ttl?: number
  /** Where recordings live; memory by default, which one process is enough for. */
  store?: IdempotencyStore
}

/**
 * A request sent twice is answered once. A client that may have to send
 * a request again (bridge, when no response came back) puts the same
 * `Idempotency-Key` on every try; keep records the first answer under
 * it and plays it again for the rest, so a lost response never means a
 * second order. The same key with another request is refused (422), and
 * while the first is still being answered, so is a second (409). Requests
 * without the header pass as they are: nothing to turn off.
 *
 *   keep({ router })                               // memory, an hour
 *   keep({ router, idempotency: { ttl: 24 * 60 * 60 * 1000, store: redisStore } })
 */
export function idempotency(options: IdempotencyOptions = {}): Middleware {
  const chamber = new Chamber(options)
  return (handler) => (ctx) => chamber.answer(ctx, handler)
}

/** One key at a time: looked up, refused, replayed or recorded. */
class Chamber {
  private readonly store: IdempotencyStore
  private readonly ttl: number

  constructor(options: IdempotencyOptions) {
    this.store = options.store ?? new MemoryStore()
    this.ttl = options.ttl ?? 60 * 60 * 1000
  }

  async answer(ctx: Context, handler: Handler): Promise<Response> {
    const key = ctx.request.headers.get(KEY_HEADER)
    if (!key || SAFE_METHODS.has(ctx.request.method)) return handler(ctx)
    const fingerprint = await fingerprintOf(ctx.request)
    const running = { fingerprint, response: null }
    if (await this.store.claim(key, running, this.ttl))
      return this.first(key, fingerprint, ctx, handler)
    // Claimed by another try; gone again by now (expired) still means one is in hand
    return this.again((await this.store.get(key)) ?? running, fingerprint)
  }

  /** A key seen before: the same request gets the recording, another is a mistake, one still running must wait. */
  private again(known: Recorded, fingerprint: string): Response {
    if (known.fingerprint !== fingerprint)
      return refused(422, 'another request')
    if (!known.response)
      return refused(409, 'the first is still being answered')
    return replay(known.response)
  }

  /** The handler's answer, recorded under the key; a throw, a server error (5xx: a retry should run again) or an answer too big to keep leaves nothing behind. */
  private async first(
    key: string,
    fingerprint: string,
    ctx: Context,
    handler: Handler,
  ) {
    try {
      const response = await handler(ctx)
      if (response.status >= 500) return this.unrecorded(key, response)
      return this.record(key, fingerprint, response)
    } catch (error) {
      await this.store.delete(key)
      throw error
    }
  }

  private async record(key: string, fingerprint: string, response: Response) {
    const { sent, kept } = await recordingOf(response)
    if (kept)
      await this.store.set(key, { fingerprint, response: kept }, this.ttl)
    else await this.tooBig(key)
    return sent
  }

  private async tooBig(key: string): Promise<void> {
    console.warn(
      `idempotency: the answer to key "${key}" is too big to keep; a retry would run again`,
    )
    await this.store.delete(key)
  }

  private async unrecorded(key: string, response: Response): Promise<Response> {
    await this.store.delete(key)
    return response
  }
}

function refused(status: number, why: string): Response {
  return new Response(
    `idempotency: this Idempotency-Key was already used for ${why}`,
    { status },
  )
}
