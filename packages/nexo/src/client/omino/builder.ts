import {
  isComponentClass,
  isSlotClass,
  notAComponent,
  type Component,
  type ComponentClass,
} from '../../shared/omino/component'
import {
  Element as OminoElement,
  Fragment,
  Scoped,
  type Child,
  type Scope,
} from '../../shared/omino/element'
import { For, readEach, type ForProps } from '../../shared/omino/for'
import { readerOf, isHole } from '../../shared/omino/hole'
import { assertTag, VOID_ELEMENTS } from '../../shared/omino/html'
import { isNothing, rawOf, textOf } from '../../shared/omino/leaf'
import type { RenderContext } from '../../shared/omino/render'
import {
  childrenOf,
  componentProps,
  isSkipped,
  SlotResolver,
} from '../../shared/omino/slots'
import { Swap, type SwapOrder } from '../../shared/omino/swap'
import { ShadowContent, stylesOf, styledTree } from '../../shared/omino/styles'
import { Holes } from './holes'
import type { InsertedPhase, Life } from './life'
import { ForList } from './for-list'
import { Motions } from './motions'
import { ElementProps } from './props'
import type { Reactivity } from './reactivity'
import { Region } from './region'
import { ensureSheet, shadowSheet } from './sheets'

const HTML = 'http://www.w3.org/1999/xhtml'
const SVG = 'http://www.w3.org/2000/svg'
const MATHML = 'http://www.w3.org/1998/Math/MathML'

/** Where a child is being built: its life, the phase its refs wait on, its slots, its namespace. */
export interface Place {
  life: Life
  phase: InsertedPhase
  scope: Scope
  ns: string
}

/**
 * Turns a tree into DOM nodes, outside-in (R.11): each component gets its
 * parent's life, the context and its slots before its children are built.
 * One method per kind of node, as the server's `Renderer`.
 */
export class DomBuilder {
  private readonly slots = new SlotResolver()
  private readonly holes: Holes
  private readonly props: ElementProps
  private readonly motions = new Motions()

  constructor(
    private readonly reactivity: Reactivity,
    private readonly context: RenderContext,
  ) {
    this.holes = new Holes(reactivity)
    this.props = new ElementProps(this.holes, this.motions)
  }

  build(child: Child, place: Place): Node[] {
    if (isHole(child)) return this.region(child, place)
    if (isNothing(child)) return []
    const text = textOf(child)
    if (text !== undefined) return [document.createTextNode(text)]
    const html = rawOf(child)
    if (html !== undefined) return parse(html)
    return this.branch(child, place)
  }

  private branch(child: Child, place: Place): Node[] {
    if (child instanceof Scoped || Array.isArray(child))
      return this.list(child, place)
    if (child instanceof OminoElement) return this.element(child, place)
    throw new Error(
      `omino: can't build ${Object.prototype.toString.call(child)}. Children are text, numbers, elements, raw(), holes or lists of them`,
    )
  }

  private list(child: Child, place: Place): Node[] {
    return this.slots
      .flatten(child, place.scope)
      .flatMap(({ child, scope }) => this.build(child, { ...place, scope }))
  }

  /** A hole as a child: a region the hole fills (C.12), `out-in` unless a `Swap` says. */
  private region(hole: Child, place: Place, order?: SwapOrder): Node[] {
    const region = this.regionAt(place, order)
    const show = (value: unknown) => region.show(value as Child)
    const nodes = region.nodes()
    this.holes.write(hole, show, place.life.signal)
    return nodes
  }

  private regionAt(place: Place, order?: SwapOrder): Region {
    const { life, phase } = place
    return new Region(life, this.into(place), this.motions, order, phase)
  }

  /** `<Swap order>` (C.15c): its child hole is a region with that order. */
  private swap(props: Record<string, unknown>, place: Place): Node[] {
    const order = props.order as SwapOrder | undefined
    const child = props.children as Child
    if (!isHole(child)) return this.build(child, place)
    return this.region(child, place, order)
  }

  /** `<For>` (C.14): a keyed region, fed by `each`. */
  private keyed(props: ForProps<unknown>, place: Place): Node[] {
    const { life, phase } = place
    const into = this.into(place)
    const { reactivity, motions } = this
    const list = new ForList(props, life, into, reactivity, motions, phase)
    const update = (items: unknown) => list.update(items as unknown[])
    const nodes = list.nodes()
    this.holes.write(readEach(props.each), update, life.signal)
    return nodes
  }

  /** How a region builds its content: in the same scope and namespace, on its own life. */
  private into(place: Place) {
    return (child: Child, life: Life, phase: InsertedPhase) =>
      this.build(child, { ...place, life, phase })
  }

  private element(element: OminoElement, place: Place): Node[] {
    if (isHole(element.props.if)) return this.presence(element, place)
    if (isSkipped(element)) return []
    return this.byType(element, place)
  }

  private byType({ type, props }: OminoElement, place: Place): Node[] {
    if (type === Fragment) return this.build(props.children as Child, place)
    if (type === For) return this.keyed(props as never, place)
    if (type === Swap) return this.swap(props, place)
    if (isSlotClass(type)) return this.slot(type, props, place)
    if (typeof type === 'string') return [this.tag(type, props, place)]
    if (isComponentClass(type)) return this.component(type, props, place)
    throw notAComponent(type)
  }

  /**
   * `if={hole}` (C.15a): created when it turns true, removed when it turns
   * false, never recreated while it stays true.
   */
  private presence(element: OminoElement, place: Place): Node[] {
    const { if: condition, ...props } = element.props
    const shown = new OminoElement(element.type, props)
    const read = readerOf(condition as () => unknown)
    return this.region(() => (read() ? shown : null), place)
  }

  private tag(
    tag: string,
    props: Record<string, unknown>,
    place: Place,
  ): Element {
    assertTag(tag)
    const el = create(tag, place.ns)
    const { children, if: _if, slot: _slot, ref, ...rest } = props
    const inside = { ...place, ns: namespaceInside(tag, el.namespaceURI!) }
    if (el.localName === 'script') ensureInert(rest.type, children as Child)
    if (children instanceof ShadowContent) this.shadow(el, children, inside)
    else this.children(el, children as Child, inside)
    this.props.apply(el, rest, this.where(place))
    if (ref !== undefined) this.ref(el, ref, place)
    return el
  }

  private children(el: Element, children: Child, place: Place): void {
    const nodes = this.build(children, place)
    if (nodes.length > 0 && VOID_ELEMENTS.has(el.localName))
      throw new Error(
        `omino: <${el.localName}> can't have children: HTML has no closing tag for it. Put the content next to it instead`,
      )
    el.append(...nodes)
  }

  /** `shadow` (item 36): the content in the element's shadow root, the styles adopted. */
  private shadow(el: Element, shadow: ShadowContent, place: Place): void {
    const root = el.attachShadow({ mode: 'open' })
    root.adoptedStyleSheets = [shadowSheet(shadow.styles)]
    root.append(...this.build(shadow.content, { ...place, ns: HTML }))
  }

  /** `ref={(el, { signal }) => …}` (C.17a): once, when the element is in the document. */
  private ref(el: Element, ref: unknown, place: Place): void {
    if (typeof ref !== 'function')
      throw new Error(
        `omino: <${el.localName} ref> takes a function: (el, { signal }) => …`,
      )
    this.inserted(() => ref(el, { signal: place.life.signal }), place)
  }

  private component(
    type: ComponentClass,
    props: Record<string, unknown>,
    place: Place,
  ): Node[] {
    const instance = new type(componentProps(props, place.scope))
    const life = place.life.child()
    const tree = styled(type, this.template(instance, life))
    const scope = { children: childrenOf(instance.props) }
    const nodes = this.build(tree, { ...place, life, scope })
    this.whenMounted(instance, { ...place, life })
    return nodes
  }

  /** `mounted({ signal })` (C.15b): after its children's, on the inserted phase. */
  private whenMounted(instance: Component<any>, place: Place): void {
    if (!instance.mounted) return
    const run = { signal: place.life.signal }
    this.inserted(() => instance.mounted!(run), place)
  }

  /** Runs once, untracked (C.12); on the client it can't wait (R.16). */
  private template(instance: Component<any>, life: Life): Child {
    const run = { signal: life.signal }
    const tree = this.reactivity.untrack(() =>
      instance.template(this.context, run),
    )
    if (!(tree instanceof Promise)) return tree
    throw new Error(
      `omino: ${instance.constructor.name}.template() returned a promise. In the browser a template can't wait: load data with resource() and show its status (R.16)`,
    )
  }

  private slot(
    type: ComponentClass,
    props: Record<string, unknown>,
    place: Place,
  ): Node[] {
    const { children, if: _if, ...rest } = props
    const own = new type({ ...rest, children }).props as Record<string, unknown>
    return this.slots
      .content(own, place.scope)
      .flatMap(({ child, scope }) => this.build(child, { ...place, scope }))
  }

  private where(place: Place) {
    const inserted = (fn: () => unknown) => this.inserted(fn, place)
    return { signal: place.life.signal, inserted }
  }

  /** An untracked effect on the inserted phase (C.15b): once, children first. */
  private inserted(fn: () => unknown, place: Place): void {
    const { effect, untrack } = this.reactivity
    effect(() => untrack(fn), {
      scheduler: place.phase,
      signal: place.life.signal,
    })
  }
}

/** Its root marked and its CSS in the document (C.20a), or its shadow root (item 36). */
function styled(type: ComponentClass, tree: Child): Child {
  const styles = stylesOf(type)
  if (!styles) return tree
  if (styles.encapsulation !== 'shadow') ensureSheet(styles)
  return styledTree(tree, styles)
}

function create(tag: string, ns: string): Element {
  const own = tag === 'svg' ? SVG : tag === 'math' ? MATHML : ns
  return own === HTML
    ? document.createElement(tag)
    : document.createElementNS(own, tag)
}

/** Inside <svg>/<math> the children are theirs; <foreignObject> goes back to HTML. */
function namespaceInside(tag: string, ns: string): string {
  return tag === 'foreignObject' ? HTML : ns
}

/** Trusted markup from `raw()`, parsed as HTML. */
function parse(html: string): Node[] {
  const template = document.createElement('template')
  template.innerHTML = html
  return [...template.content.childNodes]
}

/** A <script> made in the browser runs: only data types are allowed (JSON). */
function ensureInert(type: unknown, children: Child): void {
  if (isNothing(children) || /json$/i.test(String(type ?? ''))) return
  throw new Error(
    `omino: a <script> made in the browser would run its text. Load code with import; for data, give it type="application/json"`,
  )
}

export { HTML }
