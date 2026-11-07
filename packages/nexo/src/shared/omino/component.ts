import type { Child } from './element'
import type { RenderContext } from './render'

/**
 * Props every component receives besides its own. `children` is opaque:
 * render it (`{this.props.children}` or `<Slot />`), don't inspect it.
 */
export type ComponentProps<P> = P extends unknown
  ? Omit<P, 'children'> & { children?: Child }
  : never

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
    // A prop passed as `undefined` counts as not passed, so defaults still apply.
    const given = Object.fromEntries(
      Object.entries(props).filter(([, value]) => value !== undefined),
    )
    this.props = {
      ...collectDefaults(new.target),
      ...given,
    } as ComponentProps<P>
  }

  /**
   * The markup. `context` is what `render(page, { context })` was given:
   * the same object for every component of the page (see `RenderContext`).
   * Take it only when you need it — `template({ lang, link }) { … }` — and
   * test with `new Badge(props).template(context)`. Props stay the main way
   * in; the context is for page-wide values like the language.
   *
   * `run.signal` is the component's lifetime (R.14): pass it to the effects,
   * listeners and fetches made here, and they end with the component.
   *
   * Type the parameter as `RenderContext` (declare its fields once, see
   * `render`). TypeScript lets a method narrow its parameter to any other
   * type without complaint, and nothing would then check that `render()`
   * really passes it.
   */
  abstract template(
    context: Readonly<RenderContext>,
    run: ComponentRun,
  ): Child | Promise<Child>

  /**
   * In the browser: runs once, when the component's nodes are in the
   * document, before paint (C.15b). Its children's run first. Clean up
   * through `signal`, or return a function. Never called on the server.
   */
  mounted?(run: ComponentRun): unknown
}

/**
 * What each component's `template()` and `mounted()` receive (R.14): its
 * lifetime. Aborted when the component leaves; on the server it never is.
 */
export interface ComponentRun {
  readonly signal: AbortSignal
}

export type ComponentClass = new (props: any) => Component<any>

/**
 * Where a component shows its children. Without a name, it shows the
 * children that have no `slot` attribute (exactly what rendering
 * `this.props.children` shows); with a name, only the ones marked
 * `slot="name"`. A child marked for a slot the component never places is
 * not rendered. Its own children are the fallback when nothing was passed:
 *
 *   <footer><Slot name="footer">Gaming Reservoir</Slot></footer>
 */
export class Slot extends Component<{ name?: string }> {
  /** On its own (outside a component's template), a Slot shows its fallback. */
  template(): Child {
    return this.props.children
  }
}

const defaultsCache = new WeakMap<Function, object>()

/** Merge `static defaults` from the base class down to `ctor`, once per class. */
function collectDefaults(ctor: Function): object {
  const cached = defaultsCache.get(ctor)
  if (cached) return cached
  const merged = Object.freeze(Object.assign({}, ...defaultsChain(ctor)))
  defaultsCache.set(ctor, merged)
  return merged
}

/** Each class's own `defaults`, from the one closest to `Component` down. */
function defaultsChain(ctor: Function): object[] {
  const chain: object[] = []
  for (let c: any = ctor; c && c !== Component; c = Object.getPrototypeOf(c)) {
    if (Object.hasOwn(c, 'defaults')) chain.unshift(c.defaults)
  }
  return chain
}

/** A <Slot>, or a class that extends it. */
export function isSlotClass(type: unknown): type is ComponentClass {
  return (
    type === Slot ||
    (typeof type === 'function' && type.prototype instanceof Slot)
  )
}

export function isComponentClass(type: unknown): type is ComponentClass {
  return typeof type === 'function' && type.prototype instanceof Component
}
