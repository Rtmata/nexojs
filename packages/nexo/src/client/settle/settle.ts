/**
 * Coming and going, as every Nexo module that moves elements does it
 * (C.15c): the marks, and how long to wait for what they start. Internal:
 * omino, bridge and theater share it; it is not a public path.
 */

/** On an element while its exit plays. */
export const EXITING = 'data-exiting'
/** On an element while its entry plays (item 36). */
export const ENTERING = 'data-entering'

/** A JS motion or an endless animation: how long to wait at most (Angular's 4 s). */
export const FIXED_WAIT = 4000
/** Over the longest finite CSS animation. */
const MARGIN = 500

/** Leaving: marked, out of reach (`inert`), and focus moved out of it. */
export function markLeaving(el: Element): void {
  el.setAttribute(EXITING, '')
  if ('inert' in el) (el as HTMLElement).inert = true
  if (el.contains(document.activeElement))
    (document.activeElement as HTMLElement).blur()
}

/** A cancelled animation counts as finished. */
export function allFinished(animations: Animation[]): Promise<unknown> {
  return Promise.all(animations.map((a) => a.finished.catch(() => {})))
}

/** The longest finite animation left, plus a margin; infinite ones get the fixed wait. */
export function fallbackFor(animations: Animation[]): number {
  let longest = 0
  for (const animation of animations) {
    const end = Number(animation.effect?.getComputedTiming().endTime ?? 0)
    if (!Number.isFinite(end)) return FIXED_WAIT
    longest = Math.max(longest, end - Number(animation.currentTime ?? 0))
  }
  return Math.min(longest + MARGIN, FIXED_WAIT) // a 30 s decoration never holds the next page 30 s
}

/**
 * The animations done, or their fallback time up, whichever first;
 * `undefined` when there is nothing to wait for, so callers go on at once.
 */
export function settled(animations: Animation[]): Promise<void> | undefined {
  if (animations.length === 0) return undefined
  const timeout = new Promise((done) =>
    setTimeout(done, fallbackFor(animations)),
  )
  return Promise.race([allFinished(animations), timeout]).then(() => {})
}
