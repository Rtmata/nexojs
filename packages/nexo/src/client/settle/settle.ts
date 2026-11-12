/**
 * Coming and going, as every Nexo module that moves elements does it:
 * the marks, and how long to wait for what they start. Internal:
 * omino, bridge and theater share it; it is not a public path.
 */

/** On an element while its exit plays. */
export const EXITING = 'data-exiting'
/** On an element while its entry plays. */
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

/**
 * A leave that may not happen (pattern: memento): marked as
 * `markLeaving` does, keeping what that changed — the element's own
 * `inert`, the focus it moved out — so `undo()` puts it back as it was
 * (a navigation cancelled during its leave).
 */
export class UndoableLeave {
  private inert = false
  private focused: HTMLElement | null = null

  constructor(private readonly el: Element) {}

  mark(): void {
    this.inert = (this.el as HTMLElement).inert === true
    const active = document.activeElement
    this.focused = this.el.contains(active) ? (active as HTMLElement) : null
    markLeaving(this.el)
  }

  undo(): void {
    this.el.removeAttribute(EXITING)
    if ('inert' in this.el) (this.el as HTMLElement).inert = this.inert
    if (this.focusIsFree()) this.focused?.focus()
  }

  /** The focus goes back only where nothing took it meanwhile. */
  private focusIsFree(): boolean {
    const active = document.activeElement
    return active === null || active === document.body
  }
}

/** The animations that can end: an endless one (a spinner, a pulse) is no exit or entry, so waiting on it would only ever reach the fallback. */
export function ending(animations: Animation[]): Animation[] {
  return animations.filter((animation) =>
    Number.isFinite(Number(animation.effect?.getComputedTiming().endTime ?? 0)),
  )
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
