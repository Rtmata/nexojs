let depth = 0
const held = new Set<() => void>()

/**
 * Hold effects until `fn` ends, so several writes count as one change. Reads
 * inside still see fresh values. Batches nest; the outermost one lets go.
 *
 *   batch(() => {
 *     first.set('Ada')
 *     last.set('Lovelace')
 *   })
 */
export function batch<T>(fn: () => T): T {
  depth++
  try {
    return fn()
  } finally {
    depth--
    if (depth === 0) release()
  }
}

/** Call `notify` now, or when the batch in progress ends. */
export function whenSettled(notify: () => void): void {
  if (depth > 0) held.add(notify)
  else notify()
}

function release(): void {
  const waiting = [...held]
  held.clear()
  for (const notify of waiting) notify()
}
