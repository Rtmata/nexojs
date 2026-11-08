import { panel } from '../panel'
import { number } from '../params'
import { Marks } from './marks'

/**
 * Tooltip (WAI-ARIA APG Tooltip) as the platform writes it: an interest
 * invoker and a hint popover (Open UI interest invokers).
 *
 *   <button interestfor="tip">ⓘ</button>
 *   <div id="tip" popover="hint" data-panel="tooltip">Released in 1987</div>
 *
 * GAP BRIDGE `interestfor` (Chrome 142+ only) and `popover="hint"`
 * (Chrome 151, Firefox 153, no Safari; 2026-11): where
 * `interestForElement` exists the panel does nothing. Elsewhere it does
 * what the explainer says the platform does: interest after `start` ms
 * (500: `interest-delay: normal` measured in Chromium 156; the explainer's
 * 250 is outdated) of hover or focus on the invoker, kept while the
 * pointer or focus is on the invoker or the tooltip (WCAG 1.4.13
 * hoverable), lost `end` ms (250, measured the same way) after leaving
 * both, Escape loses it at once; `interest` / `loseinterest` fire on the tooltip with `source`.
 * A plain-text hint describes its invoker (`aria-describedby`); a rich one
 * gets `role=tooltip` and its invoker `aria-details` + `aria-expanded`.
 * Remove when every engine ships interest invokers.
 *
 * Without JS (where the platform lacks them) the tooltip stays hidden:
 * never put what's essential only in a tooltip.
 */
export const tooltip = panel({
  params: { start: number(500), end: number(250) },
  connect(el, delays, { signal }) {
    if (invokersOf(el).length === 0)
      throw new Error(
        `tooltip: <${el.localName} id="${el.id}" data-panel="tooltip"> has no <button interestfor="${el.id || '…'}"> pointing at it`,
      )
    if (hasInterest()) return
    new Interest(el as HTMLElement, delays, signal)
  },
})

export function hasInterest(): boolean {
  return 'interestForElement' in HTMLButtonElement.prototype
}

/** What makes a hint rich (the explainer): anything beyond text and images. */
const RICH =
  'a, button, input, select, textarea, h1, h2, h3, h4, h5, h6, [tabindex], [role]'

class Interest {
  private readonly marks = new Marks()
  private timer?: ReturnType<typeof setTimeout>
  private source?: HTMLElement

  constructor(
    private readonly tip: HTMLElement,
    private readonly delays: { start: number; end: number },
    signal: AbortSignal,
  ) {
    for (const invoker of this.invokers()) this.prepare(invoker, signal)
    this.listenTip(signal)
    signal.addEventListener('abort', () => this.end(), { once: true })
  }

  private invokers(): HTMLElement[] {
    return invokersOf(this.tip)
  }

  private get rich(): boolean {
    return this.tip.querySelector(RICH) !== null
  }

  private prepare(invoker: HTMLElement, signal: AbortSignal): void {
    this.describe(invoker)
    const on = { signal }
    const enter = (e: PointerEvent) => isMouse(e) && this.interested(invoker)
    const leave = (e: PointerEvent) => isMouse(e) && this.losing()
    invoker.addEventListener('pointerenter', enter, on)
    invoker.addEventListener('pointerleave', leave, on)
    invoker.addEventListener('focusin', () => this.interested(invoker), on)
    invoker.addEventListener('focusout', () => this.losing(), on)
  }

  /** The platform's mapping: plain hints describe, rich ones are details. */
  private describe(invoker: HTMLElement): void {
    if (!this.rich)
      return this.marks.default(invoker, 'aria-describedby', this.tip.id)
    this.marks.default(this.tip, 'role', 'tooltip')
    this.marks.default(invoker, 'aria-details', this.tip.id)
    this.marks.set(invoker, 'aria-expanded', 'false')
  }

  private listenTip(signal: AbortSignal): void {
    const on = { signal }
    const tip = this.tip
    tip.addEventListener('toggle', (e) => this.toggled(e as ToggleEvent), on)
    tip.addEventListener('pointerenter', () => this.keep(), on)
    tip.addEventListener('focusin', () => this.keep(), on)
    tip.addEventListener('pointerleave', () => this.losing(), on)
    tip.addEventListener('focusout', () => this.losing(), on)
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && this.lose()
    document.addEventListener('keydown', escape, on)
  }

  private interested(invoker: HTMLElement): void {
    clearTimeout(this.timer)
    if (this.isOpen() && this.source === invoker) return
    this.timer = setTimeout(() => this.show(invoker), this.delays.start)
  }

  /** On the tooltip itself: interest stays (WCAG 1.4.13 hoverable). */
  private keep(): void {
    if (this.isOpen()) clearTimeout(this.timer)
  }

  /** Leaving the invoker or the tooltip: lost unless the other one has it within `end` ms. */
  private losing(): void {
    clearTimeout(this.timer)
    this.timer = setTimeout(
      () => this.stillWanted() || this.lose(),
      this.delays.end,
    )
  }

  private stillWanted(): boolean {
    const here = [this.tip, ...this.invokers()]
    return here.some(
      (el) => el.matches(':hover') || el.matches(':focus-within'),
    )
  }

  private show(invoker: HTMLElement): void {
    if (this.isOpen()) this.lose()
    this.source = invoker
    ;(this.tip.showPopover as (o?: { source: Element }) => void)({
      source: invoker,
    })
    if (this.rich) invoker.setAttribute('aria-expanded', 'true')
    this.fire('interest')
  }

  private lose(): void {
    clearTimeout(this.timer)
    if (this.isOpen()) this.tip.hidePopover()
    this.lost()
  }

  /** Closed by the platform itself (light dismiss, its own Escape): interest is lost the same way. */
  private toggled(event: ToggleEvent): void {
    if (event.newState === 'closed' && !this.isOpen()) this.lost()
  }

  private lost(): void {
    if (!this.source) return
    if (this.rich) this.source.setAttribute('aria-expanded', 'false')
    this.fire('loseinterest')
    this.source = undefined
  }

  /** The platform's own events, with `source` as `InterestEvent` has it. */
  private fire(type: string): void {
    this.tip.dispatchEvent(
      Object.assign(new Event(type), { source: this.source }),
    )
  }

  private isOpen(): boolean {
    return this.tip.matches(':popover-open')
  }

  private end(): void {
    this.lose()
    this.marks.restore()
  }
}

/** Touch has no hover: a tap focuses the invoker, and focus shows interest. */
function isMouse(event: PointerEvent): boolean {
  return event.pointerType !== 'touch'
}

/** The buttons whose `interestfor` names this tooltip. */
function invokersOf(tip: Element): HTMLElement[] {
  if (!tip.id) return []
  const id = CSS.escape(tip.id)
  return [...document.querySelectorAll<HTMLElement>(`[interestfor="${id}"]`)]
}
