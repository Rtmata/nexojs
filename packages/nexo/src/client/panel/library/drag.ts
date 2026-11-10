import { drag as draggable } from '../../theater/drag'
import { panel } from '../panel'
import { number, oneOf } from '../params'

/**
 * Drag (F.1): the element follows the pointer and flings with inertia —
 * theater's `drag` underneath. `data-drag-axis` (`x`, `y`, `both`),
 * `-min` / `-max` (px from where it starts), `-elastic` (0.35), `-snap`
 * (a grid step in px; 0 for none). Give the same moves buttons too
 * (WCAG 2.5.7).
 *
 *   <ul data-panel="drag" data-drag-axis="x" data-drag-min="-4000" data-drag-max="0" data-drag-snap="220">
 */
export const drag = panel({
  params: {
    axis: oneOf(['x', 'y', 'both'], 'both'),
    min: number(-Infinity),
    max: number(Infinity),
    elastic: number(0.35),
    snap: number(0),
  },
  connect(el, { axis, min, max, elastic, snap }, { signal }) {
    const grid =
      snap > 0 ? { snap: (v: number) => Math.round(v / snap) * snap } : {}
    const bounds = { min, max }
    draggable(el as HTMLElement, {
      axis,
      bounds,
      elastic,
      release: { inertia: grid },
      signal,
    })
  },
})
