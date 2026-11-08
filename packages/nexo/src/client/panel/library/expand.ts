import type { Marks } from './marks'

/**
 * Expanding and collapsing nodes of a hierarchy (R.36), shared by grid's
 * treegrid rows and tree: `aria-expanded` on parents only, descendants of
 * a collapsed node hidden, `aria-level` kept. Which nodes are children is
 * the hierarchy's business (`Leveled`: flat nodes in document order, a
 * child is what follows with a deeper level).
 */
export interface Hierarchy<N extends HTMLElement> {
  all(): N[]
  level(node: N): number
  children(node: N): N[]
  parent(node: N): N | undefined
}

export class Expansion<N extends HTMLElement> {
  /**
   * `shell(node)` is what hides with the node: the node itself (a row), or
   * the list item around a link that is the treeitem (tree).
   */
  constructor(
    private readonly tree: Hierarchy<N>,
    private readonly marks: Marks,
    private readonly shell: (node: N) => HTMLElement = (node) => node,
  ) {
    for (const node of tree.all()) this.prepare(node)
  }

  /** Parents say whether they're open (closed unless the author said otherwise); the rest stay hidden. */
  private prepare(node: N): void {
    if (!this.isParent(node)) return
    this.marks.default(node, 'aria-expanded', 'false')
    if (!this.isOpen(node))
      for (const child of this.tree.children(node)) this.hide(child)
  }

  isParent(node: N): boolean {
    return this.tree.children(node).length > 0
  }

  isOpen(node: N): boolean {
    return node.getAttribute('aria-expanded') === 'true'
  }

  /** Nodes that can be seen: every ancestor open. */
  visible(): N[] {
    return this.tree.all().filter((node) => !this.shell(node).hidden)
  }

  open(node: N): boolean {
    if (!this.isParent(node) || this.isOpen(node)) return false
    this.marks.set(node, 'aria-expanded', 'true')
    for (const child of this.tree.children(node)) this.show(child)
    return true
  }

  close(node: N): boolean {
    if (!this.isOpen(node)) return false
    this.marks.set(node, 'aria-expanded', 'false')
    for (const child of this.tree.children(node)) this.hide(child)
    return true
  }

  toggle(node: N): boolean {
    return this.isOpen(node) ? this.close(node) : this.open(node)
  }

  /** Shown with its open descendants, as they were before the parent closed. */
  private show(node: N): void {
    this.marks.toggle(this.shell(node), 'hidden', false)
    if (this.isOpen(node))
      for (const child of this.tree.children(node)) this.show(child)
  }

  private hide(node: N): void {
    this.marks.toggle(this.shell(node), 'hidden', true)
    for (const child of this.tree.children(node)) this.hide(child)
  }
}

/** Flat nodes with `aria-level` in document order (treegrid rows): children follow their parent, deeper. */
export class Leveled<N extends HTMLElement> implements Hierarchy<N> {
  constructor(private readonly nodes: () => N[]) {}

  all(): N[] {
    return this.nodes()
  }

  level(node: N): number {
    return Number(node.getAttribute('aria-level') ?? 1)
  }

  children(node: N): N[] {
    const all = this.all()
    const own = this.level(node)
    const after = all.slice(all.indexOf(node) + 1)
    const descendants = takeWhile(after, (n) => this.level(n) > own)
    return descendants.filter((n) => this.level(n) === own + 1)
  }

  parent(node: N): N | undefined {
    const all = this.all()
    const own = this.level(node)
    const before = all.slice(0, all.indexOf(node)).reverse()
    return before.find((n) => this.level(n) < own)
  }
}

function takeWhile<T>(items: T[], keep: (item: T) => boolean): T[] {
  const end = items.findIndex((item) => !keep(item))
  return end < 0 ? items : items.slice(0, end)
}

/**
 * Nested lists (tree): a node is a list item's treeitem (the item, or the
 * link that starts it), its children the items of the list inside it.
 */
export class Nested<N extends HTMLElement> implements Hierarchy<N> {
  constructor(
    private readonly root: HTMLElement,
    private readonly itemOf: (li: HTMLLIElement) => N,
  ) {}

  all(): N[] {
    return [...this.root.querySelectorAll('li')].map(this.itemOf)
  }

  level(node: N): number {
    let level = 0
    for (
      let el = node.closest('ul, ol');
      el && el !== this.root;
      el = el.parentElement!.closest('ul, ol')
    )
      level++
    return level + 1
  }

  children(node: N): N[] {
    const list = node.closest('li')?.querySelector(':scope > ul, :scope > ol')
    return [...(list?.querySelectorAll(':scope > li') ?? [])].map((li) =>
      this.itemOf(li as HTMLLIElement),
    )
  }

  parent(node: N): N | undefined {
    const li = node.closest('li')?.parentElement?.closest('li')
    return li ? this.itemOf(li) : undefined
  }
}
