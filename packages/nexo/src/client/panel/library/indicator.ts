import { panel } from '../panel'
import { string } from '../params'
import { Marks } from './marks'

/**
 * Indicator (Archive's tab underline / blob): measures the active item of
 * a container and gives CSS `--indicator-x`, `--indicator-y`,
 * `--indicator-width`, `--indicator-height`, relative to the container's
 * padding box (its scrolling included), again whenever the active item
 * changes, the container scrolls, or the item or the container resizes.
 * Active = `aria-selected="true"`, `aria-current` (not `false`) or
 * `data-active`, unless `active` names another selector. The motion is CSS's.
 */
export const indicator = panel({
  params: {
    active: string(
      '[aria-selected="true"], [aria-current]:not([aria-current="false"]), [data-active]',
    ),
  },
  connect: (el, { active }, { signal }) =>
    new Indicator(el as HTMLElement, active, signal),
})

const WHEN_ACTIVE_CHANGES: MutationObserverInit = {
  subtree: true,
  childList: true,
  attributes: true,
  attributeFilter: ['aria-selected', 'aria-current', 'data-active'],
}

class Indicator {
  private readonly marks = new Marks()
  private readonly resized = new ResizeObserver(() => this.measure())
  private watched?: Element

  constructor(
    private readonly el: HTMLElement,
    private readonly active: string,
    signal: AbortSignal,
  ) {
    const changed = new MutationObserver(() => this.measure())
    this.resized.observe(el)
    changed.observe(el, WHEN_ACTIVE_CHANGES)
    el.addEventListener('scroll', () => this.measure(), {
      signal,
      passive: true,
    })
    signal.addEventListener('abort', () => this.end(changed), { once: true }) // before the first measure: a bad selector throws there, and attach aborts
    this.measure()
  }

  private measure(): void {
    const item = this.el.querySelector(this.active)
    if (!item) return
    this.watch(item)
    const box = item.getBoundingClientRect()
    const [x, y] = this.origin()
    this.set('x', box.left - x)
    this.set('y', box.top - y)
    this.set('width', box.width)
    this.set('height', box.height)
  }

  /** Where the container's padding box starts, in viewport terms, its scrolling undone. */
  private origin(): [number, number] {
    const { el } = this
    const box = el.getBoundingClientRect()
    return [
      box.left + el.clientLeft - el.scrollLeft,
      box.top + el.clientTop - el.scrollTop,
    ]
  }

  /** The active item's own size matters too (a web font arriving). */
  private watch(item: Element): void {
    if (item === this.watched) return
    if (this.watched) this.resized.unobserve(this.watched)
    this.resized.observe(item)
    this.watched = item
  }

  private set(name: string, px: number): void {
    this.marks.style(this.el, `--indicator-${name}`, `${px}px`)
  }

  private end(changed: MutationObserver): void {
    this.resized.disconnect()
    changed.disconnect()
    this.marks.restore()
  }
}
