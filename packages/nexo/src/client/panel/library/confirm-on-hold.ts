import { panel } from '../panel'
import { number, string } from '../params'
import { emit, followPointer, Hold, swallowNextClick } from './hold'
import { Marks } from './marks'
import { hideVisually } from './visually-hidden'

/**
 * Hold to confirm (Archive). Pointer: hold for `duration` ms; let go
 * early, anywhere, and nothing happens (WCAG 2.5.2: never on the down
 * event). Keyboard: hold Space/Enter the same way, OR press once to arm it
 * (the `armed` text is announced) and once more to confirm, with no timing
 * (WCAG 2.1.1); Escape or leaving disarms. It ends in
 * `confirm-on-hold:confirm`; a plain click does nothing. CSS sees
 * `data-holding` / `data-armed` and `--hold-duration` for the fill.
 *
 *   <button data-panel="confirm-on-hold">Delete</button>
 */
export const confirmOnHold = panel({
  params: { duration: number(800), armed: string('Press again to confirm') },
  connect: (el, params, { signal }) =>
    new ConfirmOnHold(el as HTMLElement, params, signal),
  events: {
    pointerdown: (e, ctx) => ctx.down(e as PointerEvent),
    contextmenu: (e, ctx) => ctx.holding && e.preventDefault(),
    keydown: (e, ctx) => ctx.keyDown(e as KeyboardEvent),
    keyup: (e, ctx) => ctx.keyUp(e as KeyboardEvent),
    focusout: (_e, ctx) => ctx.disarm(),
    click: (e, ctx) => ctx.clicked(e as MouseEvent),
  },
})

class ConfirmOnHold {
  private readonly hold: Hold
  private readonly marks = new Marks()
  private readonly live: HTMLElement
  private armed = false

  constructor(
    private readonly el: HTMLElement,
    private readonly params: { duration: number; armed: string },
    private readonly signal: AbortSignal,
  ) {
    this.hold = new Hold(
      params.duration,
      Infinity,
      () => this.confirm(),
      signal,
    )
    this.marks.style(el, '--hold-duration', `${params.duration}ms`)
    this.live = liveRegion(el, signal)
    signal.addEventListener('abort', () => this.marks.restore(), { once: true })
  }

  get holding(): boolean {
    return this.hold.holding
  }

  /**
   * A pointer's click is swallowed (the hold is the gesture). A click with
   * no pointer behind it (`detail === 0`: a screen reader in browse mode,
   * voice control, switch access, `el.click()`) takes the timing-free
   * path: arm, then confirm (WCAG 2.1.1).
   */
  clicked(event: MouseEvent): void {
    event.preventDefault()
    event.stopImmediatePropagation()
    if (event.detail !== 0) return
    if (this.armed) this.confirm()
    else this.arm()
  }

  down(event: PointerEvent): void {
    if (event.button !== 0) return
    this.press()
    followPointer(event.pointerId, { up: () => this.release() }, this.signal)
  }

  press(): void {
    this.hold.start()
    this.marks.toggle(this.el, 'data-holding', true)
  }

  /** Let go before the end: no confirmation (Up Reversal). */
  release(): void {
    this.hold.cancel()
    this.marks.toggle(this.el, 'data-holding', false)
  }

  keyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') return this.disarm()
    if (!isActivation(event) || event.repeat) return
    event.preventDefault()
    this.press()
  }

  /** Released early by keyboard: the timing-free path, arm then confirm. */
  keyUp(event: KeyboardEvent): void {
    if (!isActivation(event) || !this.hold.holding) return
    this.release()
    if (this.armed) this.confirm()
    else this.arm()
  }

  disarm(): void {
    this.armed = false
    this.marks.toggle(this.el, 'data-armed', false)
    this.live.textContent = ''
  }

  private arm(): void {
    this.armed = true
    this.marks.toggle(this.el, 'data-armed', true)
    this.live.textContent = this.params.armed
  }

  private confirm(): void {
    this.release()
    this.disarm()
    swallowNextClick(this.el, this.signal)
    emit(this.el, 'confirm-on-hold:confirm')
  }
}

function isActivation(event: KeyboardEvent): boolean {
  return event.key === ' ' || event.key === 'Enter'
}

/** A polite live region next to the button, gone with the panel. */
function liveRegion(el: HTMLElement, signal: AbortSignal): HTMLElement {
  const live = document.createElement('span')
  live.setAttribute('aria-live', 'polite')
  hideVisually(live)
  el.after(live)
  signal.addEventListener('abort', () => live.remove(), { once: true })
  return live
}
