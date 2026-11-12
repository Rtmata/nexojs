/** Input types that don't take typed text. */
const NOT_TYPED = new Set([
  'checkbox',
  'radio',
  'button',
  'submit',
  'reset',
  'range',
  'color',
  'file',
])

/** Inputs no text is typed in that still use the arrow keys themselves. */
const OWN_KEYS = new Set(['range', 'color', 'file'])

/**
 * Whether `target` takes typed text: a text field, a select, or any
 * editable region (`contenteditable` with any value, `plaintext-only`
 * too). Panels leave the keys to it.
 */
export function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  if (target instanceof HTMLTextAreaElement) return true
  if (target instanceof HTMLSelectElement) return true
  return target instanceof HTMLInputElement && !NOT_TYPED.has(target.type)
}

/** Whether `target` uses the keys itself: what `typing` says, and a slider, a colour or a file input. */
export function takesKeys(target: EventTarget | null): boolean {
  if (typing(target)) return true
  return target instanceof HTMLInputElement && OWN_KEYS.has(target.type)
}
