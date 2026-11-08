import { panel } from '../panel'
import { number, string } from '../params'
import { emit } from './hold'
import { Marks } from './marks'
import { animationsDone } from './motion'
import { topModal } from './close-top'

/**
 * Toast (R.40): a messages region that exists from the first render
 * (Roselli: a live region added later is often not announced), whose
 * children are the messages, added by the app or by bridge
 * (`data-bridge-swap="append"`). A message the server rendered is layer 0.
 *
 *   <div data-panel="toast" role="log" aria-label="Notices"><p>Saved</p></div>
 *
 * `role="log"` (the default) for ordered, polite messages; `role="alert"`
 * for an urgent region. Messages stay until closed (WCAG 2.2.1): the panel
 * gives each one a close button (`data-toast-dismiss`, named by the `close`
 * param). With `duration`, a message without controls of its own leaves
 * by itself, paused while hovered or focused and while the window isn't
 * (Radix). `key` (F8) moves focus to the region in use (`toastRegion()`).
 * Placing it is CSS (`position: fixed`); never `display: none` it.
 * `toast:dismiss` carries `{ text, reason }` (`close` or `timeout`).
 */
export const toast = panel({
  params: { duration: number(0), close: string('Close'), key: string('F8') },
  connect: (el, params, { signal }) =>
    new Toasts(el as HTMLElement, params, signal),
})

/**
 * Where a message goes now: the region inside the top-most open modal
 * dialog (outside it everything is inert), else the page's own.
 */
export function toastRegion(): HTMLElement | null {
  const regions = [
    ...document.querySelectorAll<HTMLElement>('[data-panel~="toast"]'),
  ]
  const top = topModal()
  if (top) return regions.find((r) => r.closest('dialog') === top) ?? null
  return regions.find((r) => !r.closest('dialog')) ?? null
}

const CONTROLS = 'a[href], button, input, select, textarea, [tabindex]'

interface Params {
  duration: number
  close: string
  key: string
}

class Toasts {
  private readonly marks = new Marks()
  private readonly timers = new Map<Element, Countdown>()
  private readonly made: HTMLElement[] = []
  private paused = { pointer: false, focus: false, window: false }
  private readonly leaving = new Set<Element>()

  constructor(
    private readonly el: HTMLElement,
    private readonly params: Params,
    private readonly signal: AbortSignal,
  ) {
    if (el instanceof HTMLUListElement || el instanceof HTMLOListElement)
      throw new Error(
        `toast: data-panel="toast" goes on a <div> or <section>, not <${el.localName}>: ARIA lets no list be a log or an alert`,
      )
    this.marks.default(el, 'role', 'log')
    this.paused.window = !document.hasFocus()
    for (const message of el.children) this.arrived(message as HTMLElement)
    this.observe(signal)
    this.listen(signal)
    signal.addEventListener('abort', () => this.end(), { once: true })
  }

  private observe(signal: AbortSignal): void {
    const observer = new MutationObserver((records) => {
      for (const record of records)
        for (const node of record.addedNodes)
          if (node instanceof HTMLElement) this.arrived(node)
    })
    observer.observe(this.el, { childList: true })
    signal.addEventListener('abort', () => observer.disconnect(), {
      once: true,
    })
  }

  private listen(signal: AbortSignal): void {
    const on = { signal }
    const el = this.el
    el.addEventListener('click', (e) => this.clicked(e), on)
    el.addEventListener('pointerenter', () => this.pause('pointer', true), on)
    el.addEventListener('pointerleave', () => this.pause('pointer', false), on)
    el.addEventListener('focusin', () => this.pause('focus', true), on)
    el.addEventListener('focusout', (e) => this.left(e), on)
    this.listenPage(signal)
  }

  /** The window losing focus pauses too (Radix); the key works from anywhere. */
  private listenPage(signal: AbortSignal): void {
    const on = { signal }
    addEventListener('blur', () => this.pause('window', true), on)
    addEventListener('focus', () => this.pause('window', false), on)
    document.addEventListener('keydown', (e) => this.key(e), on)
  }

  /** A new message: its close button, and its countdown when it has no controls of its own. */
  private arrived(message: HTMLElement): void {
    const timed = this.params.duration > 0 && !message.querySelector(CONTROLS)
    message.append(this.closeButton())
    if (!timed) return
    const countdown = new Countdown(this.params.duration, () =>
      this.dismiss(message, 'timeout'),
    )
    this.timers.set(message, countdown)
    if (!this.isPaused()) countdown.run()
  }

  private closeButton(): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = '×'
    button.setAttribute('aria-label', this.params.close)
    button.setAttribute('data-toast-dismiss', '')
    this.made.push(button)
    return button
  }

  private clicked(event: MouseEvent): void {
    const button = (event.target as Element).closest('[data-toast-dismiss]')
    const message = button?.parentElement
    if (message?.parentElement === this.el) this.dismiss(message, 'close')
  }

  /** Gone, after its exit animation (`[data-leaving]`, at most 4 s); focus stays in the region. */
  private async dismiss(
    message: HTMLElement,
    reason: 'close' | 'timeout',
  ): Promise<void> {
    if (this.leaving.has(message)) return
    this.leaving.add(message)
    this.timers.get(message)?.stop()
    this.timers.delete(message)
    if (message.contains(document.activeElement)) this.keepFocus(message)
    this.marks.toggle(message, 'data-leaving', true)
    await animationsDone(message)
    this.gone(message, reason)
  }

  /** Unless the panel ended meanwhile: removed and announced. */
  private gone(message: HTMLElement, reason: 'close' | 'timeout'): void {
    if (this.signal.aborted) return
    const text = textOf(message)
    message.remove()
    emit(this.el, 'toast:dismiss', { text, reason })
  }

  /** Focus moves to the next message's close button, else the previous one's, else the region. */
  private keepFocus(message: HTMLElement): void {
    const near = message.nextElementSibling ?? message.previousElementSibling
    const button = near?.querySelector<HTMLElement>('[data-toast-dismiss]')
    if (button) return button.focus()
    this.marks.default(this.el, 'tabindex', '-1')
    this.el.focus()
  }

  private left(event: FocusEvent): void {
    if (!this.el.contains(event.relatedTarget as Node | null))
      this.pause('focus', false)
  }

  private pause(why: keyof Toasts['paused'], on: boolean): void {
    this.paused[why] = on
    for (const countdown of this.timers.values())
      this.isPaused() ? countdown.hold() : countdown.run()
  }

  private isPaused(): boolean {
    return Object.values(this.paused).some(Boolean)
  }

  /** The key reaches the region in use: the top modal's, else the page's. */
  private key(event: KeyboardEvent): void {
    if (event.key !== this.params.key || toastRegion() !== this.el) return
    event.preventDefault()
    this.marks.default(this.el, 'tabindex', '-1')
    this.el.focus()
  }

  /** A close button holding focus leaves: focus goes to the region, not to <body>. */
  private end(): void {
    for (const countdown of this.timers.values()) countdown.stop()
    const focused = this.made.some((b) => b.contains(document.activeElement))
    for (const button of this.made) button.remove()
    if (focused) ((this.el.tabIndex = -1), this.el.focus())
    this.marks.restore()
  }
}

/** A timeout that can wait: what's left is kept while it holds. */
class Countdown {
  private left: number
  private started = 0
  private timer?: ReturnType<typeof setTimeout>

  constructor(
    duration: number,
    private readonly done: () => void,
  ) {
    this.left = duration
  }

  run(): void {
    if (this.timer !== undefined) return
    this.started = performance.now()
    this.timer = setTimeout(this.done, this.left)
  }

  hold(): void {
    if (this.timer === undefined) return
    this.stop()
    this.left -= performance.now() - this.started
  }

  stop(): void {
    clearTimeout(this.timer)
    this.timer = undefined
  }
}

/** The message's own text, without its close button's. */
function textOf(message: HTMLElement): string {
  const copy = message.cloneNode(true) as HTMLElement
  copy.querySelector('[data-toast-dismiss]')?.remove()
  return (copy.textContent ?? '').trim()
}
