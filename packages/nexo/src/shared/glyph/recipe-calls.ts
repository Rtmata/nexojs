/**
 * Module state, on purpose and only this: the sheets of the recipes called
 * so far, and who listens. `checkRecipes` (development, in the browser)
 * compares them with the page's sheets. A recipe can't know which
 * component calls it; the page can say whether its sheet arrived.
 */
const called = new Set<string>()
let listener: ((sheet: string) => void) | undefined

/** A recipe was called: its sheet is needed on the page. */
export function noteCall(sheet: string): void {
  if (called.has(sheet)) return
  called.add(sheet)
  listener?.(sheet)
}

/** Every sheet needed so far, then each new one as it is first needed, while `signal` lives. */
export function onNeededSheet(
  fn: (sheet: string) => void,
  signal: AbortSignal,
): void {
  if (signal.aborted) return
  for (const sheet of called) fn(sheet)
  listener = fn
  signal.addEventListener('abort', () => (listener = undefined), { once: true })
}
