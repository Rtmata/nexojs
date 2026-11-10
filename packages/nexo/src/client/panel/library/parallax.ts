import { parallax as layer } from '../../theater/parallax'
import { panel } from '../panel'
import { number, oneOf } from '../params'

/**
 * Parallax (D.3): the element lags (or leads) the scroll by its depth —
 * theater's `parallax` underneath, with its fallback and its "nothing
 * under reduced motion". `data-parallax-depth` (0.5 by default),
 * `data-parallax-axis`.
 *
 *   <div data-panel="parallax" data-parallax-depth="0.3">
 */
export const parallax = panel({
  params: {
    depth: number(0.5),
    axis: oneOf(['block', 'inline', 'x', 'y'], 'block'),
  },
  connect(el, { depth, axis }, { signal }) {
    layer(el, { depth, axis, signal })
  },
})
