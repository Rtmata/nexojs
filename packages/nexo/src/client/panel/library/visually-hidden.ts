/** Out of sight, still read by assistive technology: the usual visually-hidden pattern. */
export const VISUALLY_HIDDEN: Readonly<Record<string, string>> = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  'clip-path': 'inset(50%)',
  'white-space': 'nowrap',
}

/** A new element of the panel's own, hidden that way. */
export function hideVisually(el: HTMLElement): void {
  for (const [name, value] of Object.entries(VISUALLY_HIDDEN))
    el.style.setProperty(name, value)
}
