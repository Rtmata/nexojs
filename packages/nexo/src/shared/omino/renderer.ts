import { Attributes } from './attributes'
import {
  isComponentClass,
  isSlotClass,
  notAComponent,
  type ComponentClass,
} from './component'
import { Element, Fragment, Scoped, type Child, type Scope } from './element'
import { assertTag, escapeHtml, RAW_TEXT_ELEMENTS, VOID_ELEMENTS } from './html'
import { isNothing, rawOf, textOf } from './leaf'
import { RawText } from './raw-text'
import type { RenderContext } from './render'
import type { SegmentPicker } from './segment'
import { For } from './for'
import { isHole, readOnce } from './hole'
import {
  childrenOf,
  componentProps,
  isSkipped,
  SlotResolver,
  type Placed,
} from './slots'
import { PageSheets, stylesOf, styledTree } from './styles'

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
    /** Set by `render(page, { only })`: collects the segments asked for. */
    private readonly picker?: SegmentPicker,
    /** The page's component styles, each once (C.20a). */
    readonly sheets = new PageSheets(),
  ) {
    this.rawText = new RawText(slots)
  }

  /** The page's HTML. */
  async page(tree: Child): Promise<string> {
    return this.child(tree, { children: undefined })
  }

  /** Leaves answer at once; only elements and lists may wait. */
  private child(child: Child, scope: Scope): string | Promise<string> {
    if (isHole(child)) return this.child(readOnce(child) as Child, scope) // C.12
    const html = leafHtml(child)
    return html ?? this.branch(child, scope)
  }

  private branch(child: Child, scope: Scope): string | Promise<string> {
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
    if (isSkipped(element)) return ''
    const { type, props } = element
    if (type === Fragment) return this.child(props.children as Child, scope)
    if (type === For)
      return this.child(new For(props as never).template(), scope)
    if (isSlotClass(type)) return this.slot(type, props, scope)
    if (typeof type === 'string') return this.tag(type, props, scope)
    if (isComponentClass(type)) return this.component(type, props, scope)
    throw notAComponent(type)
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
      this.picker,
      this.sheets,
    ))
  }

  private html(): Renderer {
    return (this.htmlRenderer ??= new Renderer(
      this.context,
      this.slots,
      false,
      this.picker,
      this.sheets,
    ))
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
    const instance = new type(componentProps(props, scope))
    const made = await instance.template(this.context, SERVER_RUN)
    const tree = this.styled(type, made)
    const html = await this.child(tree, {
      children: childrenOf(instance.props),
    })
    this.picker?.offer(instance, html)
    return html
  }

  /** Its root marked, and its CSS kept for the page's head (C.20a). */
  private styled(type: ComponentClass, tree: Child): Child {
    const listed = stylesOf(type)
    if (!listed) return tree
    for (const sheet of listed.sheets) this.sheets.addPageWide(sheet)
    const { own } = listed
    if (!own) return tree
    if (own.encapsulation !== 'shadow') this.sheets.add(own)
    return styledTree(tree, own)
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
}

/** The server renders once: a component's lifetime never ends there (R.14). */
const SERVER_RUN = { signal: new AbortController().signal }

/** Where a browser takes over XML rules for the elements inside. */
const FOREIGN_ROOTS = new Set(['svg', 'math'])

/** Elements whose first newline the HTML parser drops: one more keeps the author's. */
const NEWLINE_EATERS = new Set(['pre', 'textarea', 'listing'])

function keepFirstNewline(name: string, inner: string): string {
  return NEWLINE_EATERS.has(name) && inner.startsWith('\n')
    ? '\n' + inner
    : inner
}

/** The HTML of a leaf: nothing, escaped text, or `raw()` as is. */
function leafHtml(child: Child): string | undefined {
  if (isNothing(child)) return ''
  const text = textOf(child)
  return text !== undefined ? escapeHtml(text) : rawOf(child)
}
