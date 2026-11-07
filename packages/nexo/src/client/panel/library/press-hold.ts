import { panel } from '../panel'
import { number } from '../params'
import { at, emit, Hold, swallowNextClick } from './hold'

/**
 * A long press (Archive): `press-hold:press` once the pointer has stayed
 * down `duration` ms (400, Android's default long-press timeout) within
 * `slop` px (8, Android's touch slop). The click that follows is
 * swallowed, the context menu doesn't open while it's held. The keyboard
 * twin (WCAG 2.5.1 alternative): the ContextMenu key or Shift+F10.
 *
 *   <li data-panel="press-hold" data-press-hold-duration="500">…</li>
 */
export const pressHold = panel({
  params: { duration: number(400), slop: number(8) },
  connect: (el, { duration, slop }, { signal }) =>
    new PressHold(el, duration, slop, signal),
  events: {
    pointerdown: (e, ctx) => ctx.down(e as PointerEvent),
    pointermove: (e, ctx) => ctx.hold.moved(at(e as PointerEvent)),
    pointerup: (_e, ctx) => ctx.hold.cancel(),
    pointercancel: (_e, ctx) => ctx.hold.cancel(),
    contextmenu: (e, ctx) => ctx.contextMenu(e),
    keydown: (e, ctx) => ctx.key(e as KeyboardEvent),
  },
})

class PressHold {
  readonly hold: Hold
  private pointerType = ''

  constructor(
    private readonly el: Element,
    duration: number,
    slop: number,
    private readonly signal: AbortSignal,
  ) {
    this.hold = new Hold(duration, slop, () => this.pressed())
  }

  down(event: PointerEvent): void {
    if (event.button !== 0) return
    this.pointerType = event.pointerType
    this.hold.start(at(event))
  }

  /** While a press is held, the menu a long touch would open stays shut. */
  contextMenu(event: Event): void {
    if (this.hold.holding) event.preventDefault()
  }

  key(event: KeyboardEvent): void {
    if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10'))
      return
    event.preventDefault()
    this.pointerType = 'keyboard'
    this.pressed()
  }

  private pressed(): void {
    if (this.pointerType !== 'keyboard') swallowNextClick(this.el, this.signal)
    emit(this.el, 'press-hold:press', { pointerType: this.pointerType })
  }
}
