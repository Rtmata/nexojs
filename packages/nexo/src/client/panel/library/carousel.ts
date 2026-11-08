import { panel } from '../panel'
import { number, string } from '../params'
import { emit } from './hold'
import { Marks } from './marks'
import { reducedMotion } from './motion'

/**
 * Carousel (WAI-ARIA APG Carousel) on a scroll-snap scroller: layer 0 is
 * native scrolling (touch, wheel, scrollbar; CSS `scroll-snap-type`), the
 * slides its children. The panel names the parts as APG asks
 * (`aria-roledescription` carousel / slide, "N of M" only for slides
 * without a name of their own), wires the buttons you wrote, keeps
 * `data-current` on the visible slide, and rotates when asked.
 *
 *   <section data-panel="carousel" aria-label="Screens" data-carousel-interval="5000">
 *     <button data-carousel-toggle></button>
 *     <button data-carousel-prev aria-label="Previous">‹</button>
 *     <ul data-carousel-slides><li><img …></li><li><img …></li></ul>
 *     <button data-carousel-next aria-label="Next">›</button>
 *   </section>
 *
 * Rotation (`interval` ms, 0 = none) stops while hovered or focused and
 * only the toggle restarts it (APG); the toggle's label says what it will
 * do (`play` / `pause` params); the slides are `aria-live="off"` while
 * rotating, `polite` when stopped. Scrolling is instant under
 * `prefers-reduced-motion`. `carousel:change` carries `{ index }`.
 */
export const carousel = panel({
  params: {
    interval: number(0),
    play: string('Start slide rotation'),
    pause: string('Stop slide rotation'),
  },
  connect: (el, params, { signal }) =>
    new Carousel(el as HTMLElement, params, signal),
})

interface Params {
  interval: number
  play: string
  pause: string
}

class Carousel {
  private readonly marks = new Marks()
  private readonly scroller: HTMLElement
  private rotating = false
  private timer?: ReturnType<typeof setInterval>
  private current = -1

  constructor(
    private readonly el: HTMLElement,
    private readonly params: Params,
    signal: AbortSignal,
  ) {
    this.scroller =
      el.querySelector<HTMLElement>('[data-carousel-slides]') ?? slidesIn(el)
    this.prepare()
    this.listen(signal)
    this.arrived()
    if (params.interval > 0) this.rotate(true)
    signal.addEventListener('abort', () => this.end(), { once: true })
  }

  private slides(): HTMLElement[] {
    return [...this.scroller.children] as HTMLElement[]
  }

  private prepare(): void {
    const { el, marks } = this
    marks.default(el, 'role', 'region')
    marks.set(el, 'aria-roledescription', 'carousel')
    this.slides().forEach((slide, i) => this.prepareSlide(slide, i))
    const toggle = this.toggle()
    if (toggle && this.params.interval <= 0)
      marks.toggle(toggle, 'hidden', true)
  }

  private prepareSlide(slide: HTMLElement, i: number): void {
    this.marks.set(slide, 'role', 'group')
    this.marks.set(slide, 'aria-roledescription', 'slide')
    if (
      !slide.hasAttribute('aria-label') &&
      !slide.hasAttribute('aria-labelledby')
    )
      this.marks.set(slide, 'aria-label', `${i + 1} of ${this.slides().length}`)
  }

  private toggle(): HTMLElement | null {
    return this.el.querySelector('[data-carousel-toggle]')
  }

  private listen(signal: AbortSignal): void {
    const on = { signal }
    this.el.addEventListener('click', (e) => this.clicked(e), on)
    this.scroller.addEventListener('scroll', () => this.arrived(), {
      ...on,
      passive: true,
    })
    this.listenPauses(signal)
  }

  /** APG: rotation stops while the pointer or focus is on the carousel. */
  private listenPauses(signal: AbortSignal): void {
    const on = { signal }
    const outside = (e: FocusEvent) =>
      !this.el.contains(e.relatedTarget as Node)
    this.el.addEventListener('pointerenter', () => this.hold(), on)
    this.el.addEventListener('focusin', () => this.hold(), on)
    this.el.addEventListener('pointerleave', () => this.resume(), on)
    this.el.addEventListener('focusout', (e) => outside(e) && this.resume(), on)
  }

  private clicked(event: MouseEvent): void {
    const button = (event.target as Element).closest<HTMLElement>(
      '[data-carousel-prev], [data-carousel-next], [data-carousel-toggle]',
    )
    if (!button || !this.el.contains(button)) return
    if (button.hasAttribute('data-carousel-toggle'))
      return this.rotate(!this.rotating)
    this.go(this.current + (button.hasAttribute('data-carousel-next') ? 1 : -1))
  }

  /** The slide whose start is nearest the scroller's is the current one (any direction). */
  private arrived(): void {
    const slides = this.slides()
    const start = this.scroller.getBoundingClientRect().left
    const gaps = slides.map((s) =>
      Math.abs(s.getBoundingClientRect().left - start),
    )
    const index = gaps.indexOf(Math.min(...gaps))
    if (index === this.current) return
    this.current = index
    slides.forEach((s, i) => this.marks.toggle(s, 'data-current', i === index))
    emit(this.el, 'carousel:change', { index })
  }

  /** To slide `index`, wrapping around; smooth unless motion is reduced. */
  private go(index: number): void {
    const slides = this.slides()
    const slide = slides[(index + slides.length) % slides.length]
    if (!slide) return
    const behavior = reducedMotion() ? 'instant' : 'smooth'
    const left = this.scroller.scrollLeft + this.offsetOf(slide)
    this.scroller.scrollTo({ left, behavior })
  }

  /** Where the slide starts, from the scroller's start (any positioning, any direction). */
  private offsetOf(slide: HTMLElement): number {
    const start = this.scroller.getBoundingClientRect().left
    return slide.getBoundingClientRect().left - start
  }

  // ---- rotation (APG): the toggle is the only thing that restarts it

  private rotate(on: boolean): void {
    this.rotating = on
    clearInterval(this.timer)
    this.timer = on ? this.ticking() : undefined
    this.label(on)
    this.marks.set(this.scroller, 'aria-live', on ? 'off' : 'polite')
  }

  /** The toggle says what it will do (APG). */
  private label(rotating: boolean): void {
    const toggle = this.toggle()
    const text = rotating ? this.params.pause : this.params.play
    if (toggle) this.marks.set(toggle, 'aria-label', text)
  }

  private ticking(): ReturnType<typeof setInterval> {
    return setInterval(() => this.go(this.current + 1), this.params.interval)
  }

  private hold(): void {
    clearInterval(this.timer)
    this.timer = undefined
  }

  /** The pointer or focus left: rotation goes on only if it was never stopped, and nothing else holds it. */
  private resume(): void {
    if (!this.rotating || this.timer !== undefined) return
    if (this.el.matches(':hover, :focus-within')) return
    this.timer = this.ticking()
  }

  private end(): void {
    clearInterval(this.timer)
    this.marks.restore()
  }
}

/** Without `data-carousel-slides`: the first list, else the element with the most children. */
function slidesIn(el: HTMLElement): HTMLElement {
  const list = el.querySelector<HTMLElement>('ul, ol')
  if (list) return list
  throw new Error(
    'carousel: no slides; mark their container with data-carousel-slides',
  )
}
