import { COMPONENT_STYLE, PAGE_SHEET } from '../markup/vocabulary'
import { Element as OminoElement, Fragment, type Child } from './element'
import { escapeHtml } from './html'

/**
 * How a component's styles reach only its own markup:
 * `scope` (the default) with the platform's `@scope`; `shadow` in a shadow
 * root; `none` global, as written.
 */
export type Encapsulation = 'scope' | 'shadow' | 'none'

/** The root of a component with styles carries its name. */
export const SCOPE_ATTRIBUTE = 'data-scope'

/**
 * CSS as a plain string; the tag is there for editors to highlight it.
 *
 *   static styles = [css`:scope { padding: 1rem } h2 { margin: 0 }`]
 */
export function css(
  strings: TemplateStringsArray,
  ...values: (string | number)[]
): string {
  return strings.reduce((text, part, i) => text + String(values[i - 1]) + part)
}

/** A component's own CSS, its name and encapsulation. */
export interface ComponentStyles {
  name: string
  css: string
  encapsulation: Encapsulation
}

/**
 * A page-wide sheet in a `styles` list: any value with a name and its CSS
 * (glyph's tokens, themes, recipes). omino puts it once per page as
 * it is, with no scope: it brings its own classes and layers.
 */
export interface PageSheet {
  readonly name: string
  readonly css: string
}

/** What a component's `styles` list holds, split: its own CSS, and the page-wide sheets. */
export interface ListedStyles {
  readonly own?: ComponentStyles
  readonly sheets: readonly PageSheet[]
}

interface StyledClass {
  name: string
  styles?: unknown
  encapsulation?: Encapsulation
}

/**
 * The list read: strings are the component's own CSS, joined in order;
 * `{ name, css }` values are page-wide sheets.
 *
 *   static styles = [tokens, button, css`:scope { display: grid }`]
 */
export function stylesOf(type: unknown): ListedStyles | undefined {
  const { name, styles, encapsulation = 'scope' } = type as StyledClass
  if (styles === undefined) return undefined
  const { texts, sheets } = split(listOf(name, styles))
  if (sheets.length > 0 && encapsulation === 'shadow')
    throw sheetsInShadow(name)
  const css = texts.join('\n')
  ensureClosed(name, [css, ...sheets.map((s) => s.css)])
  const own = texts.length > 0 ? { name, css, encapsulation } : undefined
  return { own, sheets }
}

/** The component's own CSS texts, and the page-wide sheets, in their order. */
function split(items: (string | PageSheet)[]) {
  return {
    texts: items.filter((item) => typeof item === 'string'),
    sheets: items.filter((item) => typeof item !== 'string'),
  }
}

function ensureClosed(name: string, texts: readonly string[]): void {
  for (const text of texts) ensureNoClosingTag(name, text)
}

/** Every item a string or a `{ name, css }`, or an error that says what was given. */
function listOf(name: string, styles: unknown): (string | PageSheet)[] {
  if (!Array.isArray(styles))
    throw new Error(
      `omino: ${name}.styles is a list: static styles = [css\`…\`], with any sheets beside it`,
    )
  for (const item of styles) if (!isStyle(item)) throw notAStyle(name, item)
  return styles as (string | PageSheet)[]
}

function isStyle(item: unknown): item is string | PageSheet {
  if (typeof item === 'string') return true
  const sheet = item as PageSheet | null
  return typeof sheet?.name === 'string' && typeof sheet.css === 'string'
}

function notAStyle(name: string, item: unknown): Error {
  return new Error(
    `omino: ${name}.styles holds ${typeof item === 'object' ? JSON.stringify(item) : String(item)}; each item is CSS text or a sheet with a name and its css`,
  )
}

/**
 * shortcut: page-wide sheets don't reach into a shadow root, so a recipe's
 * classes wouldn't apply inside; upgrade (adopt them in each shadow root
 * too) when a shadow component needs one.
 */
function sheetsInShadow(name: string): Error {
  return new Error(
    `omino: ${name} lists page-wide sheets but has encapsulation 'shadow'; they reach the document only, not a shadow root. Use 'scope', or ask for shadow support`,
  )
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
  private readonly pageWide = new Map<string, PageSheet>()

  add(styles: ComponentStyles): void {
    const known = this.sheets.get(styles.name)
    if (known && known.css !== styles.css) throw sameName(styles.name)
    this.sheets.set(styles.name, styles)
  }

  /** Once per page by name; one name with two different CSS is an error. */
  addPageWide(sheet: PageSheet): void {
    const known = this.pageWide.get(sheet.name)
    if (known && known.css !== sheet.css) throw samePageSheet(sheet.name)
    this.pageWide.set(sheet.name, sheet)
  }

  into(html: string): string {
    if (this.sheets.size === 0 && this.pageWide.size === 0) return html
    const at = html.search(/<\/head>/i)
    if (at < 0) return this.html() + html
    return html.slice(0, at) + this.html() + html.slice(at)
  }

  /** The page-wide sheets first: a component's own CSS is unlayered and wins anyway. */
  private html(): string {
    const pageWide = [...this.pageWide.values()].map(pageSheetElement)
    return [...pageWide, ...[...this.sheets.values()].map(styleElement)].join(
      '',
    )
  }
}

export function styleElement(styles: ComponentStyles): string {
  const name = escapeHtml(styles.name)
  return `<style ${COMPONENT_STYLE}="${name}">${pageCss(styles)}</style>`
}

export function pageSheetElement(sheet: PageSheet): string {
  return `<style ${PAGE_SHEET}="${escapeHtml(sheet.name)}">${sheet.css}</style>`
}

export function samePageSheet(name: string): Error {
  return new Error(
    `omino: two sheets named "${name}" have different CSS; a page holds one per name, so give one another name`,
  )
}

function sameName(name: string): Error {
  return new Error(
    `omino: two components named ${name} have different styles, and they'd share one scope. Rename one class`,
  )
}
