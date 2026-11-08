import { panel } from '../panel'
import { number } from '../params'
import { at, emit, followPointer, Hold, swallowNextClick } from './hold'

/**
 * A long press (Archive): `press-hold:press` once the pointer has stayed
 * down `duration` ms (400, Android's default long-press timeout) within
 * `slop` px (8, Android's touch slop). Letting go anywhere, inside or
 * outside, before that cancels it (WCAG 2.5.2). The click that follows is
 * swallowed, the context menu doesn't open for a press that fired. The
 * keyboard twin (WCAG 2.5.1 alternative): the ContextMenu key or Shift+F10.
 *
 *   <li data-panel="press-hold" data-press-hold-duration="500">…</li>
 */
export const pressHold = panel({
  params: { duration: number(400), slop: number(8) },
  connect: (el, { duration, slop }, { signal }) =>
    new PressHold(el, duration, slop, signal),
  events: {
    pointerdown: (e, ctx) => ctx.down(e as PointerEvent),
    contextmenu: (e, ctx) => ctx.contextMenu(e),
    keydown: (e, ctx) => ctx.key(e as KeyboardEvent),
  },
})

class PressHold {
  private readonly hold: Hold
  private pointerType = ''
  private fired = false

  constructor(
    private readonly el: Element,
    duration: number,
    slop: number,
    private readonly signal: AbortSignal,
  ) {
    this.hold = new Hold(duration, slop, () => this.pressed(), signal)
  }

  down(event: PointerEvent): void {
    if (event.button !== 0) return
    this.pointerType = event.pointerType
    this.fired = false
    this.hold.start(at(event))
    const up = () => (this.hold.cancel(), (this.fired = false))
    followPointer(
      event.pointerId,
      { move: (e) => this.hold.moved(at(e)), up },
      this.signal,
    )
  }

  /** While a press is held, or just fired, the menu a long touch would open stays shut. */
  contextMenu(event: Event): void {
    if (this.hold.holding || this.fired) event.preventDefault()
  }

  key(event: KeyboardEvent): void {
    if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10'))
      return
    event.preventDefault()
    this.pointerType = 'keyboard'
    this.pressed()
  }

  private pressed(): void {
    this.fired = this.pointerType !== 'keyboard'
    if (this.fired) swallowNextClick(this.el, this.signal)
    emit(this.el, 'press-hold:press', { pointerType: this.pointerType })
  }
}
