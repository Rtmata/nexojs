import type { Child } from './element'

/** Props every component receives besides its own. */
export type ComponentProps<P> = P & { children?: Child }

/**
 * The base class for components. A component turns props into markup:
 *
 *   type BadgeProps = { tone?: 'gold' | 'gray' }
 *
 *   class Badge extends Component<BadgeProps> {
 *     static defaults: Partial<BadgeProps> = { tone: 'gray' }
 *     template() {
 *       return <span class={['badge', `badge-${this.props.tone}`]}>{this.props.children}</span>
 *     }
 *   }
 *
 * It runs on the server, once per render: there is no lifecycle and no state.
 * `template()` may be `async` to load its own data.
 */
export abstract class Component<P extends object = {}> {
  /**
   * Values for props that are not passed. Subclasses add to their parent's
   * defaults instead of replacing them, so `DangerButton extends Button` only
   * needs to declare what changes.
   *
   * Annotate them as `Partial<Props>`: TypeScript then checks the keys, and
   * subclasses can override just some of them.
   */
  static defaults: object = {}

  readonly props: ComponentProps<P>

  constructor(props: ComponentProps<P>) {
    this.props = { ...collectDefaults(new.target), ...props }
  }

  abstract template(): Child | Promise<Child>
}

export type ComponentClass = new (props: any) => Component<any>

/**
 * Where a component shows its children. Without a name, it shows the
 * children that have no `slot` attribute (the same as `this.props.children`);
 * with a name, only the ones marked `slot="name"`. Its own children are the
 * fallback when nothing was passed:
 *
 *   <footer><Slot name="footer">Gaming Reservoir</Slot></footer>
 */
export class Slot extends Component<{ name?: string }> {
  template(): Child {
    throw new Error(
      'omino: <Slot> is placed by the renderer, never rendered on its own',
    )
  }
}

/** Merge `static defaults` from the base class down to `ctor`. */
function collectDefaults(ctor: Function): object {
  const chain: object[] = []
  let current: any = ctor
  while (current && current !== Component) {
    if (Object.hasOwn(current, 'defaults')) chain.unshift(current.defaults)
    current = Object.getPrototypeOf(current)
  }
  return Object.assign({}, ...chain)
}
