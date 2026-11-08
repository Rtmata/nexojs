import { panel } from '../panel'
import { string } from '../params'
import { Marks } from './marks'

/**
 * Slider (WAI-ARIA APG Slider, Multi-Thumb Slider) on the native
 * `<input type="range">`: it already has the APG keys, the role and the
 * values, and works without JS. The panel adds what the platform leaves
 * out: `--slider-fill` (0–100%) for styling the filled track (there's no
 * standard pseudo-element for it), `aria-valuetext` from a `valuetext`
 * template (`"{value} min"`), and, on a container of several ranges, a
 * multi-thumb slider: thumbs never cross, and each one's
 * `aria-valuemin` / `aria-valuemax` follow its neighbours (APG; the end
 * thumbs keep the native bounds); the container sees `--slider-from` /
 * `--slider-to`. A form reset repaints.
 *
 *   <input type="range" data-panel="slider" data-slider-valuetext="{value} %">
 *   <div data-panel="slider"><input type="range"><input type="range"></div>
 */
export const slider = panel({
  params: { valuetext: string('') },
  connect: (el, { valuetext }, { signal }) =>
    new Slider(el as HTMLElement, valuetext, signal),
  events: { input: (e, ctx) => ctx.changed(e.target as HTMLInputElement) },
})

class Slider {
  private readonly marks = new Marks()
  private readonly thumbs: HTMLInputElement[]

  constructor(
    private readonly el: HTMLElement,
    private readonly valuetext: string,
    signal: AbortSignal,
  ) {
    this.thumbs = thumbsOf(el)
    this.repaint()
    const form = this.thumbs[0]!.form
    form?.addEventListener('reset', () => setTimeout(() => this.repaint()), {
      signal,
    })
    signal.addEventListener('abort', () => this.marks.restore(), { once: true })
  }

  changed(thumb: HTMLInputElement): void {
    if (!this.thumbs.includes(thumb)) return
    this.keepOrder(thumb)
    this.repaint()
  }

  private repaint(): void {
    for (const thumb of this.thumbs) this.paint(thumb)
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
    this.marks.style(thumb, '--slider-fill', `${fraction(thumb) * 100}%`)
    if (this.valuetext)
      this.marks.set(
        thumb,
        'aria-valuetext',
        this.valuetext.replaceAll('{value}', thumb.value),
      )
  }

  /** APG multi-thumb: each thumb's range is bounded by its neighbours. */
  private bounds(): void {
    if (this.thumbs.length < 2) return
    this.thumbs.forEach((thumb, i) => this.bound(thumb, i))
    const percent = (t: HTMLInputElement) => `${fraction(t) * 100}%`
    this.marks.style(this.el, '--slider-from', percent(this.thumbs[0]!))
    this.marks.style(this.el, '--slider-to', percent(this.thumbs.at(-1)!))
  }

  /** The end thumbs keep the native bounds: nothing written there. */
  private bound(thumb: HTMLInputElement, i: number): void {
    const before = this.thumbs[i - 1]
    const after = this.thumbs[i + 1]
    if (before) this.marks.set(thumb, 'aria-valuemin', before.value)
    if (after) this.marks.set(thumb, 'aria-valuemax', after.value)
  }
}

function thumbsOf(el: HTMLElement): HTMLInputElement[] {
  const thumbs =
    el instanceof HTMLInputElement
      ? [el]
      : [...el.querySelectorAll<HTMLInputElement>('input[type=range]')]
  if (thumbs.length === 0)
    throw new Error(
      'slider: data-panel="slider" goes on <input type="range"> or around some',
    )
  return thumbs
}

function fraction(thumb: HTMLInputElement): number {
  const min = Number(thumb.min || 0)
  const max = Number(thumb.max || 100)
  return max === min ? 0 : (thumb.valueAsNumber - min) / (max - min)
}
