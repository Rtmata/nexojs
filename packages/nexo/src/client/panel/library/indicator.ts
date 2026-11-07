import { panel } from '../panel'
import { string } from '../params'

/**
 * Indicator (Archive's tab underline / blob): measures the active item of
 * a container and gives CSS `--indicator-x`, `--indicator-y`,
 * `--indicator-width`, `--indicator-height`, relative to the container,
 * again whenever the active item changes or anything resizes. Active =
 * `aria-selected="true"`, `aria-current` (not `false`) or `data-active`,
 * unless `active` names another selector. The motion is CSS's.
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
  constructor(
    private readonly el: HTMLElement,
    private readonly active: string,
    signal: AbortSignal,
  ) {
    const resized = new ResizeObserver(() => this.measure())
    const changed = new MutationObserver(() => this.measure())
    resized.observe(el)
    changed.observe(el, WHEN_ACTIVE_CHANGES)
    this.measure()
    signal.addEventListener(
      'abort',
      () => (resized.disconnect(), changed.disconnect()),
      { once: true },
    )
  }

  private measure(): void {
    const item = this.el.querySelector(this.active)
    if (!item) return
    const box = item.getBoundingClientRect()
    const origin = this.el.getBoundingClientRect()
    const set = (name: string, px: number) =>
      this.el.style.setProperty(`--indicator-${name}`, `${px}px`)
    set('x', box.left - origin.left)
    set('y', box.top - origin.top)
    set('width', box.width)
    set('height', box.height)
  }
}
