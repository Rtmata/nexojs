import { Component, Slot, type ComponentClass } from './component'
import {
  Element,
  Fragment,
  RawHtml,
  Scoped,
  type Child,
  type Scope,
} from './element'
import {
  assertTag,
  attributes,
  escapeHtml,
  RAW_TEXT_ELEMENTS,
  VOID_ELEMENTS,
} from './html'

/**
 * Render a page and answer with it: `<!doctype html>`, the HTML, and an
 * HTML content type (unless `init` sets its own).
 *
 *   router.get('/', () => render(<HomePage />))
 *   router.notFound(() => render(<LostRoom />, { status: 404 }))
 */
export async function render(
  tree: Child,
  init: ResponseInit = {},
): Promise<Response> {
  const html = '<!doctype html>' + (await renderToString(tree))
  const headers = new Headers(init.headers)
  if (!headers.has('content-type')) {
    headers.set('content-type', 'text/html; charset=utf-8')
  }
  return new Response(html, { ...init, headers })
}

/** Turn a tree into HTML text. Internal for now; `render()` is the public API. */
export function renderToString(tree: Child): Promise<string> {
  return renderChild(tree, { children: undefined })
}

async function renderChild(child: Child, scope: Scope): Promise<string> {
  if (child === null || child === undefined || typeof child === 'boolean') {
    return ''
  }
  if (typeof child === 'string') return escapeHtml(child)
  if (typeof child === 'number' || typeof child === 'bigint') {
    return String(child)
  }
  if (child instanceof RawHtml) return child.html
  if (child instanceof Scoped) {
    // `this.props.children` rendered directly is the default slot: the
    // children without a `slot` name. Named ones only show through <Slot name>.
    return renderSlot({}, { children: child })
  }
  if (Array.isArray(child)) {
    // Siblings render concurrently, so async components load in parallel.
    const parts = await Promise.all(child.map((c) => renderChild(c, scope)))
    return parts.join('')
  }
  if (child instanceof Element) return renderElement(child, scope)

  throw new Error(
    `omino: can't render ${Object.prototype.toString.call(child)}`,
  )
}

async function renderElement(element: Element, scope: Scope): Promise<string> {
  const { type, props } = element

  // `if` works on every element and component: falsy means "not rendered".
  if (isSkipped(element)) return ''

  if (type === Fragment) return renderChild(props.children as Child, scope)
  if (type === Slot) return renderSlot(props, scope)
  if (typeof type === 'string') return renderTag(type, props, scope)
  if (isComponentClass(type)) return renderComponent(type, props, scope)

  throw new Error(
    `omino: <${String((type as Function)?.name ?? type)}> is not a component. Components are classes that extend Component`,
  )
}

async function renderTag(
  tag: string,
  props: Record<string, unknown>,
  scope: Scope,
): Promise<string> {
  assertTag(tag)
  const { children, if: _if, ...rest } = props
  const open = `<${tag}${attributes(tag, rest)}>`

  if (VOID_ELEMENTS.has(tag)) {
    // Children that render nothing (`null`, `false`, `[]`) are fine.
    if (flatten(children as Child, scope).length > 0) {
      throw new Error(`omino: <${tag}> can't have children`)
    }
    return open
  }
  if (RAW_TEXT_ELEMENTS.has(tag)) {
    const text = textOf(tag, flatten(children as Child, scope))
    return open + neutralize(tag, text) + `</${tag}>`
  }
  return open + (await renderChild(children as Child, scope)) + `</${tag}>`
}

/**
 * The content of <script> and <style> is not HTML: browsers never decode
 * entities there, so escaping would corrupt inline JS, CSS or JSON-LD.
 * Only text, `raw()` and slots that resolve to text are accepted.
 */
function textOf(tag: string, items: Placed[]): string {
  return items
    .map(({ child, scope }) => {
      if (typeof child === 'string') return child
      if (typeof child === 'number' || typeof child === 'bigint') {
        return String(child)
      }
      if (child instanceof RawHtml) return child.html
      if (child instanceof Element && child.type === Slot) {
        return textOf(tag, slotContent(child.props, scope))
      }
      throw new Error(
        `omino: <${tag}> only accepts text; put markup or components elsewhere`,
      )
    })
    .join('')
}

/**
 * Keep raw text from ending its element early. `</tag` becomes `<\/tag`,
 * valid as is in JS strings, regexes, JSON and CSS. Inside <script>,
 * `<script` would also be a problem (after a `<!--` it starts the "double
 * escaped" state, where the real closing tag no longer counts), so its `s`
 * is written as `s`: still valid in JS strings, regexes, identifiers
 * and JSON, and read back as the same text.
 */
function neutralize(tag: string, text: string): string {
  let safe = text.replace(
    new RegExp(`</${tag}`, 'gi'),
    (match) => `<\\/${match.slice(2)}`,
  )
  if (tag === 'script') {
    safe = safe.replace(
      /<script/gi,
      (match) => `<\\u00${match.charCodeAt(1).toString(16)}${match.slice(2)}`,
    )
  }
  return safe
}

async function renderComponent(
  type: ComponentClass,
  props: Record<string, unknown>,
  scope: Scope,
): Promise<string> {
  const { children, if: _if, slot: _slot, ...rest } = props
  if (children !== undefined) {
    rest.children = new Scoped(children as Child, scope)
  }
  const instance = new type(rest)
  const tree = await instance.template()
  return renderChild(tree, { children: scopedChildren(instance) })
}

/** The component's children as its slots see them, wherever they came from. */
function scopedChildren(instance: Component<any>): Scoped | undefined {
  const children = instance.props.children as Child
  if (children === undefined) return undefined
  if (children instanceof Scoped) return children
  // From `static defaults`: no outer scope to remember.
  return new Scoped(children, { children: undefined })
}

/** Place the children marked for this slot, or the slot's fallback content. */
async function renderSlot(
  props: Record<string, unknown>,
  scope: Scope,
): Promise<string> {
  const parts = await Promise.all(
    slotContent(props, scope).map(({ child, scope }) =>
      renderChild(child, scope),
    ),
  )
  return parts.join('')
}

/** What a <Slot> shows: the children marked for it, else its own fallback. */
function slotContent(props: Record<string, unknown>, scope: Scope): Placed[] {
  const name = props.name as string | undefined
  const picked = own(scope.children).filter(
    ({ child }) => slotOf(child) === name,
  )
  if (picked.length > 0) {
    return picked.map(({ child, scope }) => ({
      child: withoutSlot(child),
      scope,
    }))
  }
  return flatten(props.children as Child, scope)
}

interface Placed {
  child: Child
  scope: Scope
}

/**
 * A component's own children, one by one, named and unnamed alike. Only the
 * component that received them sees the names; see `flatten`.
 */
function own(children: Scoped | undefined): Placed[] {
  return children ? flatten(children.children, children.scope) : []
}

/**
 * List children one by one, each with the scope it was written in.
 * Fragments are looked through and children with a falsy `if` are dropped,
 * so both behave the same whether or not slots are involved.
 *
 * A `Scoped` met here is some other component's `this.props.children` being
 * passed along, and that always means its default slot: named children are
 * not forwarded by accident. To forward one on purpose, write it out:
 * `<Slot name="header" slot="header" />`.
 */
function flatten(
  children: Child,
  scope: Scope = { children: undefined },
): Placed[] {
  if (children instanceof Scoped) {
    return own(children).filter(({ child }) => slotOf(child) === undefined)
  }
  if (Array.isArray(children)) return children.flatMap((c) => flatten(c, scope))
  if (
    children === null ||
    children === undefined ||
    typeof children === 'boolean'
  ) {
    return []
  }
  if (children instanceof Element) {
    if (isSkipped(children)) return []
    if (children.type === Fragment) {
      return flatten(children.props.children as Child, scope)
    }
  }
  return [{ child: children, scope }]
}

function isSkipped(element: Element): boolean {
  return 'if' in element.props && !element.props.if
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

function isComponentClass(type: unknown): type is ComponentClass {
  return typeof type === 'function' && type.prototype instanceof Component
}
