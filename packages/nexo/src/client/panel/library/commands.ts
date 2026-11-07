/**
 * GAP BRIDGE `command` / `commandfor` (Invoker Commands), shared by dialog
 * and menu: missing in WebKitGTK 2.50 (on in 2.52). Feature-checked, so
 * where the platform has them nothing is bridged. Remove when every engine
 * the apps target ships them.
 */
export function hasCommands(): boolean {
  return 'command' in HTMLButtonElement.prototype
}

type Command = (target: HTMLElement, button: HTMLButtonElement) => void

/** The built-in commands, as the platform names them. */
const COMMANDS: Record<string, Command> = {
  'show-modal': (d) =>
    (d as HTMLDialogElement).open || (d as HTMLDialogElement).showModal(),
  close: (d, b) => (d as HTMLDialogElement).close(b.value || undefined),
  'request-close': (d, b) =>
    (d as HTMLDialogElement).requestClose(b.value || undefined),
  'toggle-popover': (p, b) => (isOpen(p) ? p.hidePopover() : show(p, b)),
  'show-popover': (p, b) => isOpen(p) || show(p, b),
  'hide-popover': (p) => isOpen(p) && p.hidePopover(),
}

function isOpen(popover: HTMLElement): boolean {
  return popover.matches(':popover-open')
}

/** `source` makes the button the popover's invoker (focus returns to it); older engines ignore it. */
function show(popover: HTMLElement, button: HTMLButtonElement): void {
  ;(popover.showPopover as (options?: { source: Element }) => void)({
    source: button,
  })
}

/** Clicks on buttons that command `target` run the command, where the platform doesn't. */
export function bridgeCommands(target: HTMLElement, signal: AbortSignal): void {
  if (hasCommands()) return
  const onClick = (event: MouseEvent) => {
    const button = commanderOf(event, target)
    const command = COMMANDS[button?.getAttribute('command') ?? '']
    if (!button || !command) return
    event.preventDefault() // a command button's own action, as the platform's: no submit
    command(target, button)
  }
  document.addEventListener('click', onClick, { signal })
}

/** The clicked button, when it sends `target` a command. */
function commanderOf(
  event: MouseEvent,
  target: HTMLElement,
): HTMLButtonElement | null {
  const button = (event.target as Element | null)?.closest?.(
    'button[commandfor]',
  )
  if (!(button instanceof HTMLButtonElement)) return null
  return button.getAttribute('commandfor') === target.id ? button : null
}
