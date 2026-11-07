/**
 * A press that must last: a timer started on press, ended early by a
 * release, a move past `slop`, or the browser taking the pointer over
 * (`pointercancel`). What `press-hold` and `confirm-on-hold` share.
 */
export class Hold {
  private timer?: ReturnType<typeof setTimeout>
  private origin?: { x: number; y: number }

  constructor(
    private readonly duration: number,
    private readonly slop: number,
    private readonly done: () => void,
  ) {}

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

/** The click a pointer release makes after a held press: swallowed once (capture phase). */
export function swallowNextClick(el: Element, signal: AbortSignal): void {
  const swallow = (event: Event) => {
    event.preventDefault()
    event.stopImmediatePropagation()
  }
  el.addEventListener('click', swallow, { capture: true, once: true, signal })
  setTimeout(
    () => el.removeEventListener('click', swallow, { capture: true }),
    600,
  )
}

export function at(event: PointerEvent): { x: number; y: number } {
  return { x: event.clientX, y: event.clientY }
}

/** A panel's own event, `<panel>:<verb>`, as bridge's (`bridge:swap`). */
export function emit(el: Element, name: string, detail?: unknown): void {
  el.dispatchEvent(new CustomEvent(name, { bubbles: true, detail }))
}
