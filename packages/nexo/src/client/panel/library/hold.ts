import { after } from './after'

/**
 * A press that must last: a timer started on press, ended early by a
 * release, a move past `slop`, the browser taking the pointer over
 * (`pointercancel`), or the panel ending. What `press-hold` and
 * `confirm-on-hold` share.
 */
export class Hold {
  private timer?: ReturnType<typeof setTimeout>
  private origin?: { x: number; y: number }

  constructor(
    private readonly duration: number,
    private readonly slop: number,
    private readonly done: () => void,
    signal: AbortSignal,
  ) {
    signal.addEventListener('abort', () => this.cancel(), { once: true })
  }

  get holding(): boolean {
    return this.timer !== undefined
  }

  start(at?: { x: number; y: number }): void {
    this.cancel()
    this.origin = at
    this.timer = setTimeout(() => this.finish(), this.duration)
  }

  /** A pointer that wanders past the slop isn't holding any more. */
  moved(to: { x: number; y: number }): void {
    if (!this.origin || !this.holding) return
    if (Math.hypot(to.x - this.origin.x, to.y - this.origin.y) > this.slop)
      this.cancel()
  }

  cancel(): void {
    clearTimeout(this.timer)
    this.timer = undefined
  }

  private finish(): void {
    this.timer = undefined
    this.done()
  }
}

/**
 * The click a pointer release makes after a held press: swallowed once
 * (capture phase). The window closes a moment after the release, however
 * long the press went on.
 */
export function swallowNextClick(el: Element, signal: AbortSignal): void {
  const own = new AbortController() // ends every listener of this one swallow, whichever comes first
  const done = AbortSignal.any([signal, own.signal])
  const swallow = (event: Event) => (stopped(event), own.abort())
  el.addEventListener('click', swallow, { capture: true, signal: done })
  const released = () => after(() => own.abort(), done, 300) // the click has come by then
  for (const type of ['pointerup', 'pointercancel'])
    document.addEventListener(type, released, { once: true, signal: done })
}

function stopped(event: Event): void {
  event.preventDefault()
  event.stopImmediatePropagation()
}

/**
 * The pointer that pressed `el`, followed on the document until it lets
 * go, so a release outside `el` still ends the press (WCAG 2.5.2) without
 * `setPointerCapture`, which would redirect the click to `el` and take it
 * from the buttons inside. Ends by itself on release, cancel or abort.
 */
export function followPointer(
  id: number,
  on: { move?(e: PointerEvent): void; up(e: PointerEvent): void },
  signal: AbortSignal,
): void {
  const controller = new AbortController()
  const opts = { signal: AbortSignal.any([signal, controller.signal]) }
  const own = (e: PointerEvent) => e.pointerId === id
  const end = (e: PointerEvent) => own(e) && (controller.abort(), on.up(e))
  document.addEventListener('pointermove', (e) => own(e) && on.move?.(e), opts)
  document.addEventListener('pointerup', end, opts)
  document.addEventListener('pointercancel', end, opts)
}

export function at(event: PointerEvent): { x: number; y: number } {
  return { x: event.clientX, y: event.clientY }
}

/** A panel's own event, `<panel>:<verb>`, as bridge's (`bridge:swap`). */
export function emit(el: Element, name: string, detail?: unknown): void {
  el.dispatchEvent(new CustomEvent(name, { bubbles: true, detail }))
}
