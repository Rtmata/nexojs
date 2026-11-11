/**
 * Listening to a signal only as long as it matters. Internal: theater and
 * bridge share it; it is not a public path.
 */

/**
 * Runs `onAbort` if `signal` aborts before `until` settles. The listener
 * goes either way: a long-lived signal (a page's, a mount's) must not keep
 * every ended wait or animation alive.
 */
export function onAbortUntil(
  signal: AbortSignal | undefined,
  onAbort: () => void,
  until: Promise<unknown>,
): void {
  if (!signal) return
  const listening = new AbortController()
  const options = { once: true, signal: listening.signal }
  signal.addEventListener('abort', onAbort, options)
  const stop = () => listening.abort()
  until.then(stop, stop)
}

/** `work`, or the signal's abort if that comes first: then it resolves (nothing more to wait for). */
export function untilAborted(
  work: Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) return Promise.resolve()
  const aborted = new Promise<void>((stop) =>
    onAbortUntil(signal, () => stop(), work),
  )
  return Promise.race([work, aborted])
}
