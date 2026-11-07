import { panel } from '../panel'
import { string } from '../params'

/**
 * Slider (WAI-ARIA APG Slider, Multi-Thumb Slider) on the native
 * `<input type="range">`: it already has the APG keys, the role and the
 * values, and works without JS. The panel adds what the platform leaves
 * out: `--slider-fill` (0–100%) for styling the filled track (there's no
 * standard pseudo-element for it), `aria-valuetext` from a `valuetext`
 * template (`"{value} min"`), and, on a container of several ranges, a
 * multi-thumb slider: thumbs never cross, and each one's
 * `aria-valuemin` / `aria-valuemax` follow its neighbours (APG);
 * the container sees `--slider-from` / `--slider-to`.
 *
 *   <input type="range" data-panel="slider" data-slider-valuetext="{value} %">
 *   <div data-panel="slider"><input type="range"><input type="range"></div>
 */
export const slider = panel({
  params: { valuetext: string('') },
  connect: (el, { valuetext }) => new Slider(el as HTMLElement, valuetext),
  events: { input: (e, ctx) => ctx.changed(e.target as HTMLInputElement) },
})

class Slider {
  private readonly thumbs: HTMLInputElement[]

  constructor(
    private readonly el: HTMLElement,
    private readonly valuetext: string,
  ) {
    this.thumbs =
      el instanceof HTMLInputElement
        ? [el]
        : [...el.querySelectorAll<HTMLInputElement>('input[type=range]')]
    if (this.thumbs.length === 0)
      throw new Error(
        'slider: data-panel="slider" goes on <input type="range"> or around some',
      )
    for (const thumb of this.thumbs) this.paint(thumb)
    this.bounds()
  }

  changed(thumb: HTMLInputElement): void {
    this.keepOrder(thumb)
    for (const t of this.thumbs) this.paint(t)
    this.bounds()
  }

  /** Thumbs don't cross: one stops at its neighbour. */
  private keepOrder(thumb: HTMLInputElement): void {
    const at = this.thumbs.indexOf(thumb)
    const before = this.thumbs[at - 1]
    const after = this.thumbs[at + 1]
    if (before && thumb.valueAsNumber < before.valueAsNumber)
      thumb.value = before.value
    if (after && thumb.valueAsNumber > after.valueAsNumber)
      thumb.value = after.value
  }

  private paint(thumb: HTMLInputElement): void {
    thumb.style.setProperty('--slider-fill', `${fraction(thumb) * 100}%`)
    if (this.valuetext)
      thumb.setAttribute(
        'aria-valuetext',
        this.valuetext.replaceAll('{value}', thumb.value),
      )
  }

  /** APG multi-thumb: each thumb's range is bounded by its neighbours. */
  private bounds(): void {
    if (this.thumbs.length < 2) return
    this.thumbs.forEach((thumb, i) => this.bound(thumb, i))
    const percent = (t: HTMLInputElement) => `${fraction(t) * 100}%`
    this.el.style.setProperty('--slider-from', percent(this.thumbs[0]!))
    this.el.style.setProperty('--slider-to', percent(this.thumbs.at(-1)!))
  }

  private bound(thumb: HTMLInputElement, i: number): void {
    thumb.setAttribute('aria-valuemin', this.thumbs[i - 1]?.value ?? thumb.min)
    thumb.setAttribute('aria-valuemax', this.thumbs[i + 1]?.value ?? thumb.max)
  }
}

function fraction(thumb: HTMLInputElement): number {
  const min = Number(thumb.min || 0)
  const max = Number(thumb.max || 100)
  return max === min ? 0 : (thumb.valueAsNumber - min) / (max - min)
}
