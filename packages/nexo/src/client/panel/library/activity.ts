import { panel } from '../panel'
import { number } from '../params'
import { emit } from './hold'
import { Marks } from './marks'

/**
 * Activity (Archive's activity stir): whether the visitor is here.
 * `data-activity` is `active`, `idle` (no pointer, key, wheel or focus for
 * `idle` ms) or `hidden` (the page isn't visible); `activity:change`
 * carries `{ state }`. Built on events and the Page Visibility API
 * (IdleDetector is Chrome-only and asks permission). On `<html>` it hears
 * the whole page.
 */
export const activity = panel({
  params: { idle: number(60_000) },
  connect: (el, { idle }, { signal }) => new Activity(el, idle, signal),
})

const ACTIVITY = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'focusin']

class Activity {
  private readonly marks = new Marks()
  private timer?: ReturnType<typeof setTimeout>
  private state = ''

  constructor(
    private readonly el: Element,
    private readonly idle: number,
    signal: AbortSignal,
  ) {
    for (const type of ACTIVITY)
      el.addEventListener(type, () => this.stirred(), { signal, passive: true })
    document.addEventListener('visibilitychange', () => this.visibility(), {
      signal,
    })
    signal.addEventListener('abort', () => this.end(), { once: true })
    this.visibility()
  }

  private stirred(): void {
    if (document.visibilityState === 'hidden') return
    this.become('active')
    clearTimeout(this.timer)
    this.timer = setTimeout(() => this.become('idle'), this.idle)
  }

  /** Hidden: nothing counts down meanwhile; visible again: active. */
  private visibility(): void {
    if (document.visibilityState !== 'hidden') return this.stirred()
    clearTimeout(this.timer)
    this.become('hidden')
  }

  private become(state: string): void {
    if (state === this.state) return
    this.state = state
    this.marks.set(this.el, 'data-activity', state)
    emit(this.el, 'activity:change', { state })
  }

  private end(): void {
    clearTimeout(this.timer)
    this.marks.restore()
  }
}
