import { pinch as zoom } from '../../theater/pinch'
import { panel } from '../panel'
import { boolean, number } from '../params'

/**
 * Pinch: two fingers or a trackpad zoom the element — theater's
 * `pinch` underneath. `data-pinch-min` / `-max` (1 to 4), `-pan`,
 * `-rotate`. Give zoom buttons too.
 *
 *   <div data-panel="pinch" data-pinch-max="4" data-pinch-pan>
 */
export const pinch = panel({
  params: { min: number(1), max: number(4), pan: boolean(), rotate: boolean() },
  connect(el, { min, max, pan, rotate }, { signal }) {
    zoom(el as HTMLElement, { scale: { min, max }, pan, rotate, signal })
  },
})
