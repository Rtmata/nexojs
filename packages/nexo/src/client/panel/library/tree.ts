import { panel } from '../panel'
import { Expansion, Nested } from './expand'
import { emit } from './hold'
import { Marks } from './marks'
import { Typeahead } from './typeahead'

/**
 * Tree (WAI-ARIA APG Tree View) on plain nested lists: without JS
 * it's an outline with everything shown. As APG's examples, the treeitem
 * is the `<li>`, or the link that starts it (then the `<li>` is `none`);
 * a list inside an item is its `group`.
 *
 *   <ul data-panel="tree" aria-label="Contents">
 *     <li>Part I
 *       <ul><li><a href="#c1">Chapter 1</a></li><li><a href="#c2">Chapter 2</a></li></ul>
 *     </li>
 *   </ul>
 *
 * Parents get `aria-expanded` (closed unless written `aria-expanded="true"`)
 * and their groups hide while closed. One tab stop; ↑ ↓ between visible
 * items, → opens or goes to the first child, ← closes or goes to the
 * parent, Home / End, `*` opens every sibling, typeahead. Enter on a link
 * follows it (the platform's click); on another item, Enter, Space or a
 * click selects it (`aria-selected`, one at a time) and a click on a
 * parent's own text toggles it. `tree:toggle` carries `{ id, expanded }`,
 * `tree:select` `{ id, value }` (`data-value`, else the text).
 */
export const tree = panel({
  connect: (el, _params, { signal }) => new Tree(el as HTMLElement, signal),
})

class Tree {
  private readonly marks = new Marks()
  private readonly nodes: Nested<HTMLElement>
  private readonly expansion: Expansion<HTMLElement>
  private readonly typeahead: Typeahead

  constructor(
    private readonly root: HTMLElement,
    signal: AbortSignal,
  ) {
    this.nodes = new Nested(root, itemOf)
    this.typeahead = new Typeahead(signal, ownLabel)
    this.prepare()
    this.expansion = new Expansion(this.nodes, this.marks, (node) =>
      node.closest('li')!,
    )
    this.settle(this.start())
    this.listen(signal)
    signal.addEventListener('abort', () => this.marks.restore(), { once: true })
  }

  private prepare(): void {
    this.marks.set(this.root, 'role', 'tree')
    for (const list of this.root.querySelectorAll('ul, ol'))
      this.marks.set(list, 'role', 'group')
    for (const li of this.root.querySelectorAll('li')) this.prepareItem(li)
  }

  private prepareItem(li: HTMLLIElement): void {
    const item = itemOf(li)
    this.marks.set(item, 'role', 'treeitem')
    if (item !== li) this.marks.set(li, 'role', 'none')
    this.marks.set(item, 'tabindex', '-1')
  }

  /** The tab stop to start on: the current page, else the selected item, else the first. */
  private start(): HTMLElement | undefined {
    const items = this.expansion.visible()
    return (
      items.find((i) => i.hasAttribute('aria-current')) ??
      items.find(isSelected) ??
      items[0]
    )
  }

  private settle(current: HTMLElement | undefined): void {
    for (const item of this.nodes.all())
      item.tabIndex = item === current ? 0 : -1
  }

  private listen(signal: AbortSignal): void {
    const on = { signal }
    this.root.addEventListener('keydown', (e) => this.key(e), on)
    this.root.addEventListener('click', (e) => this.clicked(e), on)
    this.root.addEventListener('focusin', (e) => this.focused(e), on)
  }

  /** Focus on an item: the tab stop; on something else inside (a button beside a link): nothing moves. */
  private focused(event: FocusEvent): void {
    const item = this.itemAround(event.target as Element)
    if (item) this.settle(item)
  }

  private itemAround(target: Element): HTMLElement | undefined {
    const item = target.closest<HTMLElement>('[role=treeitem]')
    return item && this.root.contains(item) ? item : undefined
  }

  private key(event: KeyboardEvent): void {
    const item = this.itemAround(event.target as Element)
    if (!item || event.altKey || event.ctrlKey || event.metaKey) return
    if (new TreeKey(this, item, event.key).run()) event.preventDefault()
  }

  /** A click on an item: a parent's own text toggles it; anything else selects (links navigate on their own). */
  private clicked(event: MouseEvent): void {
    const item = this.itemAround(event.target as Element)
    if (!item) return
    if (this.togglesByClick(item, event.target as Element)) this.toggle(item)
    else if (!(item instanceof HTMLAnchorElement)) this.select(item)
  }

  /** A click on a parent item's own text (not inside its group) opens or closes it. */
  private togglesByClick(item: HTMLElement, target: Element): boolean {
    const ownText = target.closest('li') === item.closest('li')
    return (
      ownText && item instanceof HTMLLIElement && this.expansion.isParent(item)
    )
  }

  // ---- for TreeKey

  go(item: HTMLElement | undefined): boolean {
    if (!item) return false
    this.settle(item)
    item.focus()
    return true
  }

  visible(): HTMLElement[] {
    return this.expansion.visible()
  }

  isParent(item: HTMLElement): boolean {
    return this.expansion.isParent(item)
  }

  isOpen(item: HTMLElement): boolean {
    return this.expansion.isOpen(item)
  }

  firstChild(item: HTMLElement): HTMLElement | undefined {
    return this.nodes.children(item)[0]
  }

  parentOf(item: HTMLElement): HTMLElement | undefined {
    return this.nodes.parent(item)
  }

  /** Siblings: the parent's children, or the root items. */
  siblingsOf(item: HTMLElement): HTMLElement[] {
    const parent = this.nodes.parent(item)
    return parent
      ? this.nodes.children(parent)
      : this.nodes.all().filter((i) => !this.nodes.parent(i))
  }

  setOpen(item: HTMLElement, open: boolean): boolean {
    const changed = open
      ? this.expansion.open(item)
      : this.expansion.close(item)
    if (changed) emit(this.root, 'tree:toggle', { id: item.id, expanded: open })
    return changed
  }

  toggle(item: HTMLElement): boolean {
    return this.setOpen(item, !this.isOpen(item))
  }

  /** Single selection: this item and no other; `tree:select` when it changed. */
  select(item: HTMLElement): boolean {
    if (isSelected(item)) return true
    for (const other of this.nodes.all())
      this.marks.set(other, 'aria-selected', String(other === item))
    const value =
      item.getAttribute('data-value') ??
      (ownText(item) || item.textContent!.trim())
    emit(this.root, 'tree:select', { id: item.id, value })
    return true
  }

  find(key: string, from: HTMLElement): HTMLElement | undefined {
    return this.typeahead.find(key, this.visible(), from)
  }
}

/** One key on one item (APG Tree View). */
class TreeKey {
  constructor(
    private readonly tree: Tree,
    private readonly item: HTMLElement,
    private readonly key: string,
  ) {}

  run(): boolean {
    const { key, item, tree } = this
    if (key === 'ArrowDown' || key === 'ArrowUp')
      return this.step(key === 'ArrowDown' ? 1 : -1)
    if (key === 'ArrowRight') return this.deeper()
    if (key === 'ArrowLeft')
      return tree.setOpen(item, false) || tree.go(tree.parentOf(item))
    if (key === 'Home' || key === 'End')
      return tree.go(key === 'Home' ? tree.visible()[0] : tree.visible().at(-1))
    return this.other()
  }

  private other(): boolean {
    const { key, item, tree } = this
    if (key === '*') return this.openSiblings()
    if (
      (key === 'Enter' || key === ' ') &&
      !(item instanceof HTMLAnchorElement)
    )
      return tree.select(item)
    if (key === 'Enter' || key === ' ') return false
    return tree.go(tree.find(key, item))
  }

  private step(by: number): boolean {
    const items = this.tree.visible()
    return this.tree.go(items[items.indexOf(this.item) + by])
  }

  /** → : a closed parent opens; an open one hands focus to its first child; a leaf does nothing. */
  private deeper(): boolean {
    const { item, tree } = this
    if (!tree.isParent(item)) return false
    return tree.setOpen(item, true) || tree.go(tree.firstChild(item))
  }

  private openSiblings(): boolean {
    for (const sibling of this.tree.siblingsOf(this.item))
      this.tree.setOpen(sibling, true)
    return true
  }
}

/** The treeitem of a list item: the link that starts it (APG's navigation tree), else the item. */
function itemOf(li: HTMLLIElement): HTMLElement {
  const first = li.firstElementChild
  return first instanceof HTMLAnchorElement && first.hasAttribute('href')
    ? first
    : li
}

/** For typeahead: an item's own line, lower case. */
function ownLabel(item: Element): string {
  return ownText(item as HTMLElement).toLowerCase()
}

/** An item's own label: its text nodes, not its group's. */
function ownText(item: HTMLElement): string {
  return [...item.childNodes]
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent!.trim())
    .join(' ')
    .trim()
}

function isSelected(item: Element): boolean {
  return item.getAttribute('aria-selected') === 'true'
}
