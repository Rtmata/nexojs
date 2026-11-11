import { COMPONENT_STYLE } from '../markup/vocabulary'
import { Element as OminoElement, Fragment, type Child } from './element'
import { escapeHtml } from './html'

/**
 * How a component's styles reach only its own markup (C.20a, item 36):
 * `scope` (the default) with the platform's `@scope`; `shadow` in a shadow
 * root; `none` global, as written.
 */
export type Encapsulation = 'scope' | 'shadow' | 'none'

/** The root of a component with styles carries its name (C.20a). */
export const SCOPE_ATTRIBUTE = 'data-scope'

/**
 * CSS as a plain string; the tag is there for editors to highlight it.
 *
 *   static styles = css`:scope { padding: 1rem } h2 { margin: 0 }`
 */
export function css(
  strings: TemplateStringsArray,
  ...values: (string | number)[]
): string {
  return strings.reduce((text, part, i) => text + String(values[i - 1]) + part)
}

/** What omino reads from a component class: its styles, name and encapsulation. */
export interface ComponentStyles {
  name: string
  css: string
  encapsulation: Encapsulation
}

interface StyledClass {
  name: string
  styles?: string
  encapsulation?: Encapsulation
}

export function stylesOf(type: unknown): ComponentStyles | undefined {
  const styled = type as StyledClass
  if (typeof styled.styles !== 'string') return undefined
  ensureNoClosingTag(styled.name, styled.styles)
  return {
    name: styled.name,
    css: styled.styles,
    encapsulation: styled.encapsulation ?? 'scope',
  }
}

/**
 * The CSS as it goes into the page: inside `@scope`, from this component's
 * root to the next component's (`to`), so it never leaks into children.
 * Bare selectors add no specificity there (MDN).
 */
export function pageCss(styles: ComponentStyles): string {
  if (styles.encapsulation === 'none') return styles.css
  const root = `[${SCOPE_ATTRIBUTE}="${styles.name}"]`
  return `@scope (${root}) to ([${SCOPE_ATTRIBUTE}]) {\n${styles.css}\n}`
}

/** The template's tree, its root marked as this component's (`scope`) or hosting a shadow root (`shadow`). */
export function styledTree(tree: Child, styles: ComponentStyles): Child {
  if (styles.encapsulation === 'none') return tree
  if (styles.encapsulation === 'shadow') return shadowHost(tree, styles)
  return stamp(tree, styles.name)
}

/** Every top-level element gets `data-scope`; fragments and lists are looked through. */
function stamp(tree: Child, name: string): Child {
  if (Array.isArray(tree)) return tree.map((child) => stamp(child, name))
  if (!(tree instanceof OminoElement)) return tree
  if (tree.type === Fragment)
    return new OminoElement(Fragment, {
      ...tree.props,
      children: stamp(tree.props.children as Child, name),
    })
  if (typeof tree.type !== 'string') return tree
  return new OminoElement(tree.type, { ...tree.props, [SCOPE_ATTRIBUTE]: name })
}

/**
 * `shadow`: the template's one root element hosts a shadow root holding its
 * children and the styles (declarative shadow DOM on the server).
 */
function shadowHost(tree: Child, styles: ComponentStyles): Child {
  if (!(tree instanceof OminoElement) || typeof tree.type !== 'string')
    throw new Error(
      `omino: ${styles.name} has encapsulation 'shadow': its template must return one element, the shadow root's host`,
    )
  const { children, ...props } = tree.props
  return new OminoElement(tree.type, {
    ...props,
    children: new ShadowContent(children as Child, styles),
  })
}

/** A shadow root as the server writes it, and as the client builds it. */
export class ShadowContent extends OminoElement {
  constructor(
    readonly content: Child,
    readonly styles: ComponentStyles,
  ) {
    super('template', {
      shadowrootmode: 'open',
      children: [new OminoElement('style', { children: styles.css }), content],
    })
  }
}

/** A `</style>` inside would end the element early. */
function ensureNoClosingTag(name: string, css: string): void {
  if (!/<\/style/i.test(css)) return
  throw new Error(
    `omino: ${name}.styles contains "</style", which would end the <style> early`,
  )
}

/**
 * The page's sheets on the server: each component's CSS once, into `<head>`,
 * or in front when there's none (a segment). Two different classes with one
 * name and different styles would share a scope: that's an error.
 */
export class PageSheets {
  private readonly sheets = new Map<string, ComponentStyles>()

  add(styles: ComponentStyles): void {
    const known = this.sheets.get(styles.name)
    if (known && known.css !== styles.css) throw sameName(styles.name)
    this.sheets.set(styles.name, styles)
  }

  into(html: string): string {
    if (this.sheets.size === 0) return html
    const at = html.search(/<\/head>/i)
    if (at < 0) return this.html() + html
    return html.slice(0, at) + this.html() + html.slice(at)
  }

  private html(): string {
    return [...this.sheets.values()].map(styleElement).join('')
  }
}

export function styleElement(styles: ComponentStyles): string {
  const name = escapeHtml(styles.name)
  return `<style ${COMPONENT_STYLE}="${name}">${pageCss(styles)}</style>`
}

function sameName(name: string): Error {
  return new Error(
    `omino: two components named ${name} have different styles, and they'd share one scope. Rename one class`,
  )
}
