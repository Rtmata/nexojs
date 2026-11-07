import { panel } from '../panel'
import { number } from '../params'
import { emit } from './hold'

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
    signal.addEventListener('abort', () => clearTimeout(this.timer), {
      once: true,
    })
    this.stirred()
  }

  private stirred(): void {
    if (document.visibilityState === 'hidden') return
    this.become('active')
    clearTimeout(this.timer)
    this.timer = setTimeout(() => this.become('idle'), this.idle)
  }

  private visibility(): void {
    if (document.visibilityState === 'hidden') this.become('hidden')
    else this.stirred()
  }

  private become(state: string): void {
    if (state === this.state) return
    this.state = state
    this.el.setAttribute('data-activity', state)
    emit(this.el, 'activity:change', { state })
  }
}
