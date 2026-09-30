import { Component, Slot, type ComponentClass } from './component'
import {
  Fragment,
  isElement,
  RawHtml,
  Scoped,
  type Child,
  type Element,
  type Scope,
} from './element'
import { assertTag, attributes, escapeHtml, VOID_ELEMENTS } from './html'

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
  if (child instanceof Scoped) return renderChild(child.children, child.scope)
  if (Array.isArray(child)) {
    // Siblings render concurrently, so async components load in parallel.
    const parts = await Promise.all(child.map((c) => renderChild(c, scope)))
    return parts.join('')
  }
  if (isElement(child)) return renderElement(child, scope)

  throw new Error(
    `omino: can't render ${Object.prototype.toString.call(child)}`,
  )
}

async function renderElement(element: Element, scope: Scope): Promise<string> {
  const { type, props } = element

  // `if` works on every element and component: falsy means "not rendered".
  if ('if' in props && !props.if) return ''

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
    if (children !== undefined) {
      throw new Error(`omino: <${tag}> can't have children`)
    }
    return open
  }
  return open + (await renderChild(children as Child, scope)) + `</${tag}>`
}

async function renderComponent(
  type: ComponentClass,
  props: Record<string, unknown>,
  scope: Scope,
): Promise<string> {
  const { children, if: _if, slot: _slot, ...rest } = props
  const instance = new type({
    ...rest,
    children:
      children === undefined ? undefined : new Scoped(children as Child, scope),
  })
  const tree = await instance.template()
  return renderChild(tree, {
    children: instance.props.children as Scoped | undefined,
  })
}

/** Place the children marked for this slot, or the slot's fallback content. */
function renderSlot(
  props: Record<string, unknown>,
  scope: Scope,
): Promise<string> {
  const name = props.name as string | undefined
  const picked = flatten(scope.children).filter(
    ({ child }) => slotOf(child) === name,
  )

  if (picked.length === 0) return renderChild(props.children as Child, scope)

  return Promise.all(
    picked.map(({ child, scope }) => renderChild(withoutSlot(child), scope)),
  ).then((parts) => parts.join(''))
}

interface Placed {
  child: Child
  scope: Scope
}

/** List children one by one, each with the scope it was written in. */
function flatten(
  children: Child,
  scope: Scope = { children: undefined },
): Placed[] {
  if (children instanceof Scoped)
    return flatten(children.children, children.scope)
  if (Array.isArray(children)) return children.flatMap((c) => flatten(c, scope))
  if (
    children === null ||
    children === undefined ||
    typeof children === 'boolean'
  ) {
    return []
  }
  return [{ child: children, scope }]
}

function slotOf(child: Child): string | undefined {
  return isElement(child) ? (child.props.slot as string | undefined) : undefined
}

function withoutSlot(child: Child): Child {
  if (!isElement(child) || !('slot' in child.props)) return child
  const { slot: _slot, ...props } = child.props
  return { type: child.type, props }
}

function isComponentClass(type: unknown): type is ComponentClass {
  return typeof type === 'function' && type.prototype instanceof Component
}
