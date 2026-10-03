import { Attributes } from './attributes'
import { Component, Slot, type ComponentClass } from './component'
import { Element, Fragment, Scoped, type Child, type Scope } from './element'
import { assertTag, escapeHtml, RAW_TEXT_ELEMENTS, VOID_ELEMENTS } from './html'
import { isNothing, rawOf, textOf } from './leaf'
import { RawText } from './raw-text'
import type { RenderContext } from './render'
import { isSkipped, SlotResolver, type Placed } from './slots'

/**
 * Turns one page's tree into HTML text, one method per kind of node. One
 * renderer per page: it holds the page's context, the same for every
 * component.
 */
export class Renderer {
  private readonly attributes = new Attributes()
  private readonly rawText: RawText
  /** The renderers for inside <svg>/<math> and back out, made the first time needed. */
  private foreignRenderer: Renderer | undefined
  private htmlRenderer: Renderer | undefined

  constructor(
    private readonly context: RenderContext,
    private readonly slots = new SlotResolver(),
    /**
     * Inside <svg> or <math>, the browser reads XML rules: <style> and
     * <script> there are no raw text, so their text is escaped like any.
     */
    private readonly foreign = false,
  ) {
    this.rawText = new RawText(slots)
  }

  /** The page's HTML. */
  async page(tree: Child): Promise<string> {
    return this.child(tree, { children: undefined })
  }

  /** Leaves answer at once; only elements and lists may wait. */
  private child(child: Child, scope: Scope): string | Promise<string> {
    const html = leafHtml(child)
    if (html !== undefined) return html
    // `this.props.children` rendered directly is the default slot.
    if (child instanceof Scoped)
      return this.all(this.slots.flatten(child, scope))
    if (Array.isArray(child))
      return this.all(child.map((c) => ({ child: c, scope })))
    if (child instanceof Element) return this.element(child, scope)
    throw new Error(
      `omino: can't render ${Object.prototype.toString.call(child)}. Children are text, numbers, elements, raw() or lists of them; turn other values into text first`,
    )
  }

  /**
   * Siblings render concurrently, so async components load in parallel.
   * Each one is awaited as a promise, so one failing at once still lets
   * `Promise.all` see (and handle) the others failing later.
   */
  private async all(items: readonly Placed[]): Promise<string> {
    const parts = await Promise.all(
      items.map(async ({ child, scope }) => this.child(child, scope)),
    )
    return parts.join('')
  }

  private element(element: Element, scope: Scope): Promise<string> | string {
    const { type, props } = element
    if (isSkipped(element)) return ''
    if (type === Fragment) return this.child(props.children as Child, scope)
    if (isSlotClass(type)) return this.slot(type, props, scope)
    if (typeof type === 'string') return this.tag(type, props, scope)
    if (isComponentClass(type)) return this.component(type, props, scope)
    throw new Error(
      `omino: <${String((type as Function)?.name ?? type)}> is not a component. Components are classes that extend Component`,
    )
  }

  private async tag(
    tag: string,
    props: Record<string, unknown>,
    scope: Scope,
  ): Promise<string> {
    assertTag(tag)
    const { children, if: _if, ...rest } = props
    const open = `<${tag}${this.attributes.render(tag, rest)}>`
    const items = () => this.slots.flatten(children as Child, scope)
    const name = tag.toLowerCase() // HTML tag names ignore case: <BR> is <br>
    if (VOID_ELEMENTS.has(name)) return this.voidTag(tag, open, items())
    if (RAW_TEXT_ELEMENTS.has(name) && !this.foreign)
      return this.rawTag(tag, open, rest, items())
    const inner = await this.inside(name).child(children as Child, scope)
    return open + keepFirstNewline(name, inner) + `</${tag}>`
  }

  /** <script> or <style>: their text written by its own rules. */
  private rawTag(
    tag: string,
    open: string,
    props: Record<string, unknown>,
    items: readonly Placed[],
  ): string {
    const name = tag.toLowerCase() as 'script' | 'style'
    return open + this.rawText.render(name, props, items) + `</${tag}>`
  }

  /** Who renders an element's children: crossing into or out of <svg>/<math> changes the rules. */
  private inside(name: string): Renderer {
    if (name === 'foreignobject') return this.foreign ? this.html() : this
    if (!FOREIGN_ROOTS.has(name) || this.foreign) return this
    return (this.foreignRenderer ??= new Renderer(
      this.context,
      this.slots,
      true,
    ))
  }

  private html(): Renderer {
    return (this.htmlRenderer ??= new Renderer(this.context, this.slots, false))
  }

  /** Children that render nothing (`null`, `false`, `''`, `[]`) are fine. */
  private voidTag(tag: string, open: string, items: readonly Placed[]): string {
    if (items.length === 0) return open
    throw new Error(
      `omino: <${tag}> can't have children: HTML has no closing tag for it. Put the content next to it instead`,
    )
  }

  private async component(
    type: ComponentClass,
    props: Record<string, unknown>,
    scope: Scope,
  ) {
    const { children, if: _if, slot: _slot, ...rest } = props
    if (children !== undefined)
      rest.children = new Scoped(children as Child, scope)
    const instance = new type(rest)
    const tree = await instance.template(this.context)
    return this.child(tree, { children: this.childrenOf(instance) })
  }

  /** A <Slot> (or a subclass of it, defaults included) shows what its scope gives it. */
  private slot(
    type: ComponentClass,
    props: Record<string, unknown>,
    scope: Scope,
  ) {
    const { children, if: _if, ...rest } = props
    const own = new type({ ...rest, children }).props as Record<string, unknown>
    return this.all(this.slots.content(own, scope))
  }

  /** The component's children as its slots see them, wherever they came from. */
  private childrenOf(instance: Component<any>): Scoped | undefined {
    const children = instance.props.children as Child
    if (children === undefined || children instanceof Scoped) return children
    // From `static defaults`: no outer scope to remember.
    return new Scoped(children, { children: undefined })
  }
}

/** Where a browser takes over XML rules for the elements inside. */
const FOREIGN_ROOTS = new Set(['svg', 'math'])

/** Elements whose first newline the HTML parser drops: one more keeps the author's. */
const NEWLINE_EATERS = new Set(['pre', 'textarea', 'listing'])

function keepFirstNewline(name: string, inner: string): string {
  return NEWLINE_EATERS.has(name) && inner.startsWith('\n')
    ? '\n' + inner
    : inner
}

function isSlotClass(type: unknown): type is ComponentClass {
  return (
    type === Slot ||
    (typeof type === 'function' && type.prototype instanceof Slot)
  )
}

function isComponentClass(type: unknown): type is ComponentClass {
  return typeof type === 'function' && type.prototype instanceof Component
}

/** The HTML of a leaf: nothing, escaped text, or `raw()` as is. */
function leafHtml(child: Child): string | undefined {
  if (isNothing(child)) return ''
  const text = textOf(child)
  return text !== undefined ? escapeHtml(text) : rawOf(child)
}
