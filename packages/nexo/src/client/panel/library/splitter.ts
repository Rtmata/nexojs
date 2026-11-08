import { panel } from '../panel'
import { number, oneOf } from '../params'
import { emit } from './hold'
import { Marks } from './marks'

/**
 * Window splitter (WAI-ARIA APG Window Splitter): a separator between two
 * panes that resizes the primary one, the pane its `aria-controls` names.
 * Layer 0: the panes keep their CSS sizes. The panel gives the separator
 * `role="separator"`, focus, `aria-valuenow` (the primary pane's share of
 * the container, 0–100) and writes `--splitter-size` (px) on the
 * container for your CSS:
 *
 *   <div class="shell">
 *     <nav id="side">…</nav>
 *     <div data-panel="splitter" aria-controls="side" aria-label="Sidebar width"></div>
 *     <main>…</main>
 *   </div>
 *   .shell { display: flex } #side { inline-size: var(--splitter-size, 16rem) }
 *
 * Drag it, or: ← → (↑ ↓ for `orientation="horizontal"`, panes stacked)
 * by `step` px (10; ×10 with Shift), Home / End to `min` / `max` (px; max
 * defaults to the container), Enter collapses the primary pane and
 * restores it. `splitter:resize` carries `{ size, value }`.
 */
export const splitter = panel({
  params: {
    orientation: oneOf(['vertical', 'horizontal'], 'vertical'),
    step: number(10),
    min: number(0),
    max: number(Infinity),
  },
  connect: (el, params, { signal }) =>
    new Splitter(el as HTMLElement, params, signal),
})

const EDGES: Record<string, number> = {
  Home: -Infinity,
  End: Infinity,
  Enter: 0,
}

interface Params {
  orientation: 'vertical' | 'horizontal'
  step: number
  min: number
  max: number
}

class Splitter {
  private readonly marks = new Marks()
  private readonly primary: HTMLElement
  private readonly container: HTMLElement
  private before?: number

  constructor(
    private readonly el: HTMLElement,
    private readonly params: Params,
    signal: AbortSignal,
  ) {
    this.primary = primaryOf(el)
    this.container = el.parentElement!
    this.prepare()
    this.listen(signal)
    this.announce()
    signal.addEventListener('abort', () => this.end(), { once: true })
  }

  /** Side by side (`vertical` separator) resizes the inline size; stacked, the block size. */
  private get inline(): boolean {
    return this.params.orientation === 'vertical'
  }

  private prepare(): void {
    const { el, marks } = this
    marks.set(el, 'role', 'separator')
    marks.default(el, 'tabindex', '0')
    marks.set(el, 'aria-orientation', this.params.orientation)
    marks.set(el, 'aria-valuemin', '0')
    marks.set(el, 'aria-valuemax', '100')
    el.style.touchAction = 'none'
  }

  private listen(signal: AbortSignal): void {
    const on = { signal }
    this.el.addEventListener('keydown', (e) => this.key(e), on)
    this.el.addEventListener('pointerdown', (e) => this.grab(e), on)
    this.el.addEventListener('pointermove', (e) => this.drag(e), on)
  }

  private size(): number {
    const box = this.primary.getBoundingClientRect()
    return this.inline ? box.width : box.height
  }

  private span(): number {
    const box = this.container.getBoundingClientRect()
    return this.inline ? box.width : box.height
  }

  private max(): number {
    return Math.min(this.params.max, this.span())
  }

  private key(event: KeyboardEvent): void {
    const by = this.stepFor(event)
    if (by === undefined) return
    event.preventDefault()
    if (by === 0) this.collapse()
    else this.resize(this.target(by))
  }

  /** Where `by` lands: an edge for ±Infinity (Home / End), else a step from here. */
  private target(by: number): number {
    if (by === -Infinity) return this.params.min
    if (by === Infinity) return this.max()
    return this.size() + by
  }

  /** The key's change in px: arrows on the axis, Home / End, 0 for Enter (collapse). */
  private stepFor(event: KeyboardEvent): number | undefined {
    const step = this.params.step * (event.shiftKey ? 10 : 1)
    const [less, more] = this.inline
      ? ['ArrowLeft', 'ArrowRight']
      : ['ArrowUp', 'ArrowDown']
    return { [less]: -step, [more]: step, ...EDGES }[event.key]
  }

  private grab(event: PointerEvent): void {
    if (event.button !== 0) return
    this.el.setPointerCapture(event.pointerId)
    this.el.setAttribute('data-dragging', '')
    const release = () => this.el.removeAttribute('data-dragging')
    this.el.addEventListener('pointerup', release, { once: true })
  }

  private drag(event: PointerEvent): void {
    if (!this.el.hasPointerCapture(event.pointerId)) return
    const box = this.primary.getBoundingClientRect()
    this.resize(
      this.inline ? event.clientX - box.left : event.clientY - box.top,
    )
  }

  /** Enter: to nothing, remembering the size; again, back to it. */
  private collapse(): void {
    if (this.before !== undefined) {
      this.resize(this.before)
      this.before = undefined
      return
    }
    this.before = this.size()
    this.resize(0)
  }

  private resize(px: number): void {
    const size = Math.round(Math.min(this.max(), Math.max(this.params.min, px)))
    this.container.style.setProperty('--splitter-size', `${size}px`)
    this.el.toggleAttribute('data-collapsed', size === 0)
    this.announce()
    emit(this.el, 'splitter:resize', { size, value: this.value() })
  }

  private value(): number {
    return Math.round((this.size() / this.span()) * 100)
  }

  private announce(): void {
    this.el.setAttribute('aria-valuenow', String(this.value()))
  }

  private end(): void {
    this.container.style.removeProperty('--splitter-size')
    this.el.style.touchAction = ''
    this.el.removeAttribute('aria-valuenow')
    this.el.removeAttribute('data-collapsed')
    this.marks.restore()
  }
}

function primaryOf(el: HTMLElement): HTMLElement {
  const id = el.getAttribute('aria-controls') ?? ''
  const pane = document.getElementById(id)
  if (pane) return pane
  throw new Error(
    `splitter: aria-controls="${id}" names no element; it should name the pane it resizes`,
  )
}
