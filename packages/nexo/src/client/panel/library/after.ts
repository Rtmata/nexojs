/**
 * `fn` after `ms` (the next task by default), unless `signal` ends first.
 * Its abort listener goes when the timer fires, so many calls on one
 * panel's signal don't pile listeners up.
 */
export function after(fn: () => void, signal: AbortSignal, ms = 0): void {
  const cancel = () => clearTimeout(timer)
  const timer = setTimeout(() => {
    signal.removeEventListener('abort', cancel)
    fn()
  }, ms)
  signal.addEventListener('abort', cancel, { once: true })
}
