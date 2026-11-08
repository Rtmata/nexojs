/**
 * Ask the top-most open modal `<dialog>` or popover to close (R.30): what
 * a platform back button means. Returns whether anything was open, so the
 * app decides what back does otherwise (navigate, leave):
 *
 *   onBackButtonPress(() => requestCloseTop() || history.back())   // Tauri
 *
 * In Chrome and Android WebView browsers `CloseWatcher` already turns back
 * into a close request; this is for hosts that catch back first (Tauri).
 *
 * The platform doesn't expose the top layer's order, and nothing here keeps
 * state at import (D.2). So: one inside another (a menu inside a sheet) is
 * above it; between unrelated ones, the last in the document.
 */
export function requestCloseTop(): boolean {
  const top = topMost()
  if (!top) return false
  if (top instanceof HTMLDialogElement) top.requestClose()
  else top.hidePopover()
  return true
}

function topMost(): HTMLElement | undefined {
  const open = [
    ...document.querySelectorAll<HTMLElement>('dialog, [popover]'),
  ].filter(isOnTop)
  return topOf(open)
}

/**
 * The top-most of some open top-layer elements: one inside another is
 * above it; a popover is above a modal dialog (under a modal everything is
 * inert, so only something inside it could have opened the popover, which
 * makes the popover newer); among the rest, the one with focus, else the
 * last in the document.
 */
export function topOf<T extends HTMLElement>(open: T[]): T | undefined {
  const innermost = open.filter(
    (el) => !open.some((other) => other !== el && el.contains(other)),
  )
  const popovers = innermost.filter((el) => !(el instanceof HTMLDialogElement))
  const candidates = popovers.length > 0 ? popovers : innermost
  const focused = candidates.find((el) => el.contains(document.activeElement))
  return focused ?? candidates.at(-1)
}

/** The top-most open modal `<dialog>`, if any. */
export function topModal(): HTMLDialogElement | undefined {
  const modals = [...document.querySelectorAll('dialog')]
  return topOf(modals.filter((d) => d.matches(':modal')))
}

function isOnTop(el: HTMLElement): boolean {
  if (el instanceof HTMLDialogElement) return el.matches(':modal')
  return el.matches(':popover-open')
}
