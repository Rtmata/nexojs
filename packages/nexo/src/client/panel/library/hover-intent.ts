import { panel } from '../panel'
import { number } from '../params'
import { emit } from './hold'
import { Marks } from './marks'

/**
 * Hover intent (Archive): a mouse that stays `start` ms means it, one that
 * leaves for `end` ms means it's gone (the platform's words: CSS
 * `interest-delay-start` / `-end`) (Chromium's interest delays per
 * Open UI's interest-invokers explainer: about 250 and 150 ms). Mouse only:
 * touch and pen hovers don't count. `data-intent` while it holds; events
 * `hover-intent:enter` / `hover-intent:leave`. Open UI's `interestfor`
 * (Chrome 142 only) is the native way when it's about showing a popover.
 */
export const hoverIntent = panel({
  params: { start: number(250), end: number(150) },
  connect: (el, delays, { signal }) => new HoverIntent(el, delays, signal),
  events: {
    pointerenter: (e, ctx) =>
      (e as PointerEvent).pointerType === 'mouse' && ctx.entered(),
    pointerleave: (e, ctx) =>
      (e as PointerEvent).pointerType === 'mouse' && ctx.left(),
  },
})

class HoverIntent {
  private readonly marks = new Marks()
  private timer?: ReturnType<typeof setTimeout>
  private active = false

  constructor(
    private readonly el: Element,
    private readonly delays: { start: number; end: number },
    signal: AbortSignal,
  ) {
    signal.addEventListener('abort', () => this.end(), { once: true })
  }

  entered(): void {
    this.wait(this.delays.start, true)
  }

  left(): void {
    this.wait(this.delays.end, false)
  }

  /** Each change waits its delay; a change back meanwhile calls it off. */
  private wait(ms: number, active: boolean): void {
    clearTimeout(this.timer)
    if (this.active === active) return
    this.timer = setTimeout(() => this.become(active), ms)
  }

  private become(active: boolean): void {
    this.active = active
    this.marks.toggle(this.el, 'data-intent', active)
    emit(this.el, active ? 'hover-intent:enter' : 'hover-intent:leave')
  }

  private end(): void {
    clearTimeout(this.timer)
    this.marks.restore()
  }
}
