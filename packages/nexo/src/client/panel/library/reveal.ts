import { inView } from '../../theater/in-view'
import { panel } from '../panel'
import { boolean, number, string } from '../params'

/** Marks the element while it is in view: the page's CSS animates it (the markup layer over theater). */
export const IN_VIEW = 'data-in-view'

/**
 * Reveal: `data-in-view` is on the element while it is in view, so
 * CSS can animate its arrival; theater's `inView` underneath, a visit per
 * entry. `data-reveal-amount` (0–1, how much must show), `-once`,
 * `-margin` (CSS margins around the viewport).
 *
 *   <section data-panel="reveal" data-reveal-amount="0.3">
 *   [data-in-view] { animation: rise 0.4s both }
 */
export const reveal = panel({
  params: { amount: number(0), once: boolean(), margin: string('0px') },
  connect(el, { amount, once, margin }, { signal }) {
    const visit = (_: unknown, run: { signal: AbortSignal }) => {
      el.setAttribute(IN_VIEW, '')
      if (!once)
        run.signal.addEventListener('abort', () => el.removeAttribute(IN_VIEW))
    }
    inView(el, visit, { amount, once, margin, signal })
  },
})
