/**
 * What theater returns from every animation (B.1): the shape of WAAPI's
 * `Animation`, so what you learn on MDN works on values and groups too.
 * For a single element it is the browser's own `Animation`.
 */
export interface Playback {
  play(): void
  pause(): void
  reverse(): void
  finish(): void
  cancel(): void
  currentTime: CSSNumberish | null
  playbackRate: number
  readonly playState: AnimationPlayState
  readonly finished: Promise<unknown>
}

/** Where something is written each frame: a function, or anything with `set`. */
export type ValueTarget<T> = ((value: T) => void) | { set(value: T): void }

/** The write, whichever form the target has (A.2: a signal works through `set`). */
export function writerOf<T>(target: ValueTarget<T>): (value: T) => void {
  return typeof target === 'function' ? target : (value) => target.set(value)
}

/** Whether `value` is somewhere a value can be written: a function, or anything with `set`. */
export function isValueTarget(value: unknown): value is ValueTarget<unknown> {
  if (typeof value === 'function') return true
  const set = (value as { set?: unknown } | null)?.set
  return typeof value === 'object' && typeof set === 'function'
}

/** A promise settled from outside, marked handled as WAAPI's `finished` is. */
export function deferred<T>(): PromiseWithResolvers<T> {
  const resolvers = Promise.withResolvers<T>()
  resolvers.promise.catch(() => {})
  return resolvers
}

/** WAAPI rejects `finished` with this when an animation is cancelled. */
export function abortError(): DOMException {
  return new DOMException('The animation was cancelled', 'AbortError')
}
