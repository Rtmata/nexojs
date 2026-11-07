import { Component } from './component'
import type { Child } from './element'

/**
 * How a region swaps its content (C.15c): `out-in` (the default) lets the old
 * leave fully, then the new comes; `in-out` the reverse; `together` both at
 * once, for crossfades.
 */
export type SwapOrder = 'out-in' | 'in-out' | 'together'

/**
 * A region with an order (C.15c, F.1). Its child is a hole that picks the view:
 *
 *   <Swap order="together">{() => views[tab.get()]()}</Swap>
 *
 * A hole on its own swaps `out-in` too; `Swap` is only for another order.
 * On the server it renders its child once.
 */
export class Swap extends Component<{ order?: SwapOrder }> {
  template(): Child {
    return this.props.children
  }
}
