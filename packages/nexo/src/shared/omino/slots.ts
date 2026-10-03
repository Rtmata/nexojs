import { Slot } from './component'
import { Element, Fragment, Scoped, type Child, type Scope } from './element'
import { isNothing } from './leaf'

/** One child, with the scope it was written in. */
export interface Placed {
  child: Child
  scope: Scope
}

/**
 * Decides which children each `<Slot>` shows. It never renders, it only
 * lists what to render (remembering each list, so it's built once).
 *
 * A `<Slot name>` shows the children marked `slot="name"`; an unnamed one
 * (and rendering `this.props.children` directly) shows those with no `slot`.
 * Only the component that received the children sees their names: named
 * children are never forwarded by accident. To forward one on purpose,
 * write it out: `<Slot name="header" slot="header" />`.
 */
export class SlotResolver {
  /** Each component's children, flattened once however many slots read them. */
  private readonly flattened = new WeakMap<Scoped, Placed[]>()

  /** What a <Slot> shows: the children marked for it, else its own fallback. */
  content(props: Record<string, unknown>, scope: Scope): Placed[] {
    const name = props.name as string | undefined
    const picked = this.own(scope.children).filter(
      ({ child }) => slotOf(child) === name,
    )
    if (picked.length === 0) return this.flatten(props.children as Child, scope)
    return picked.map(({ child, scope }) => ({
      child: withoutSlot(child),
      scope,
    }))
  }

  /**
   * List children one by one, each with the scope it was written in.
   * Fragments are looked through and children with a falsy `if` are
   * dropped, so both behave the same whether or not slots are involved.
   */
  flatten(children: Child, scope: Scope): Placed[] {
    if (children instanceof Scoped) return this.unnamed(children)
    if (Array.isArray(children))
      return children.flatMap((c) => this.flatten(c, scope))
    if (isNothing(children)) return []
    if (children instanceof Element) return this.flattenElement(children, scope)
    return [{ child: children, scope }]
  }

  private flattenElement(element: Element, scope: Scope): Placed[] {
    if (isSkipped(element)) return []
    if (element.type !== Fragment) return [{ child: element, scope }]
    return this.flatten(element.props.children as Child, scope)
  }

  /** Another component's `this.props.children` passed along: its default slot only. */
  private unnamed(children: Scoped): Placed[] {
    return this.own(children).filter(({ child }) => slotOf(child) === undefined)
  }

  /** A component's own children, named and unnamed alike. */
  private own(children: Scoped | undefined): Placed[] {
    if (!children) return []
    let list = this.flattened.get(children)
    if (!list) {
      list = this.flatten(children.children, children.scope)
      this.flattened.set(children, list)
    }
    return list
  }
}

/** `if` works on every element and component: falsy means "not rendered". */
export function isSkipped(element: Element): boolean {
  return 'if' in element.props && !element.props.if
}

/** A <Slot>, or an element of a class that extends it. */
export function isSlot(child: Child): child is Element {
  if (!(child instanceof Element)) return false
  const { type } = child
  return (
    type === Slot ||
    (typeof type === 'function' && type.prototype instanceof Slot)
  )
}

function slotOf(child: Child): string | undefined {
  return child instanceof Element
    ? (child.props.slot as string | undefined)
    : undefined
}

function withoutSlot(child: Child): Child {
  if (!(child instanceof Element) || !('slot' in child.props)) return child
  const { slot: _slot, ...props } = child.props
  return new Element(child.type, props)
}
