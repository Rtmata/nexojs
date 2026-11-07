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
  const innermost = open.filter(
    (el) => !open.some((other) => other !== el && el.contains(other)),
  )
  return innermost.at(-1)
}

function isOnTop(el: HTMLElement): boolean {
  if (el instanceof HTMLDialogElement) return el.matches(':modal')
  return el.matches(':popover-open')
}
