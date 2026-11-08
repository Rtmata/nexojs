import { panel } from '../panel'
import { bridgeCommands } from './commands'

/**
 * Dialog (WAI-ARIA APG Dialog (Modal)) on the native `<dialog>`: it already
 * traps focus, closes on Escape, makes the page inert and returns focus
 * (measured in Chromium 156, WebKit 27.2, Firefox 157). Layer 0 needs no JS:
 * `<button commandfor="info" command="show-modal">` opens it, `command="close"`
 * closes it. The panel adds what APG asks and the platform leaves to you,
 * a name from its first heading, a description for an alert dialog
 * (`role="alertdialog"`: its first paragraph, R.34), and bridges two gaps:
 *
 * GAP BRIDGE `command`/`commandfor` (shared, `commands.ts`).
 * GAP BRIDGE `closedby` (`any` light dismiss, `none` no Escape): missing in
 * Safari 27.2 and WebKitGTK 2.52 (2026-11). Both are feature-checked, so
 * where the platform has them the panel does nothing. Remove when they land.
 *
 *   <dialog id="info" data-panel="dialog" closedby="any"><h2>Ys</h2>…</dialog>
 */
export const dialog = panel({
  connect(el, _params, { signal }) {
    if (!(el instanceof HTMLDialogElement))
      throw new Error(
        `dialog: data-panel="dialog" goes on a <dialog>, not <${el.localName}>`,
      )
    named(el)
    if (el.getAttribute('role') === 'alertdialog') described(el)
    bridgeCommands(el, signal)
    if (!hasClosedBy()) bridgeClosedBy(el, signal)
  },
})

function hasClosedBy(): boolean {
  return 'closedBy' in HTMLDialogElement.prototype
}

/** APG: a dialog has a name; without one, its first heading gives it. */
function named(dialog: HTMLDialogElement): void {
  if (
    dialog.hasAttribute('aria-label') ||
    dialog.hasAttribute('aria-labelledby')
  )
    return
  const heading = dialog.querySelector('h1, h2, h3, h4, h5, h6')
  if (!heading) return
  heading.id ||= `${dialog.id || 'dialog'}-title`
  dialog.setAttribute('aria-labelledby', heading.id)
}

/**
 * APG: an alert dialog (`role="alertdialog"`, the standard role as the
 * switch, R.34) must describe its message; without `aria-describedby`,
 * its first paragraph is the description.
 */
function described(dialog: HTMLDialogElement): void {
  if (dialog.hasAttribute('aria-describedby')) return
  const message = dialog.querySelector('p')
  if (!message) return
  message.id ||= `${dialog.id || 'dialog'}-message`
  dialog.setAttribute('aria-describedby', message.id)
}

/** `any`: a click on the backdrop asks to close; `none`: Escape doesn't close. */
function bridgeClosedBy(dialog: HTMLDialogElement, signal: AbortSignal): void {
  const onClick = (event: MouseEvent) => {
    if (dialog.getAttribute('closedby') === 'any' && outside(dialog, event))
      dialog.requestClose()
  }
  const onCancel = (event: Event) => {
    if (dialog.getAttribute('closedby') === 'none') event.preventDefault()
  }
  dialog.addEventListener('click', onClick, { signal })
  dialog.addEventListener('cancel', onCancel, { signal })
}

/** A click the dialog element itself got, outside its box: the backdrop. */
function outside(dialog: HTMLDialogElement, event: MouseEvent): boolean {
  if (event.target !== dialog) return false
  const box = dialog.getBoundingClientRect()
  const inX = event.clientX >= box.left && event.clientX <= box.right
  return !(inX && event.clientY >= box.top && event.clientY <= box.bottom)
}
