import type { Child } from '../../shared/omino/element'
import { isNothing, textOf } from '../../shared/omino/leaf'
import type { SwapOrder } from '../../shared/omino/swap'
import { InsertedPhase, type Life } from './life'
import type { Motions } from './motions'

/** Builds a child into nodes, living on `life`; their refs wait on `phase`. */
export type BuildInto = (
  child: Child,
  life: Life,
  phase: InsertedPhase,
) => Node[]

/** What a region shows: the nodes from `first` to `last`, and their life. */
interface Content {
  life: Life
  first: Node
  last: Node
}

/**
 * A hole that returns JSX: a place between two markers, replaced whole
 * when the hole changes. Text stays one text node and only its data changes.
 * The old content leaves with its exit, the new one comes with its entry, in
 * the region's `order`: `out-in` by default.
 */
export class Region {
  private readonly start = document.createComment('')
  private readonly end = document.createComment('')
  private current?: Content
  private text?: Text
  private version = 0
  /** An `out-in` exit still playing: what comes next waits for it too. */
  private leaving?: Promise<void>

  constructor(
    private readonly owner: Life,
    private readonly build: BuildInto,
    private readonly motions: Motions,
    private readonly order: SwapOrder = 'out-in',
    /** The phase of the tree being built: the first content's refs wait on it. */
    private firstPhase?: InsertedPhase,
  ) {}

  /** The markers, to place where the region goes. */
  nodes(): Node[] {
    const fragment = document.createDocumentFragment()
    fragment.append(this.start, this.end)
    return [fragment]
  }

  show(child: Child): void {
    if (this.updateText(child)) return
    const phase = this.firstPhase
    this.firstPhase = undefined
    if (phase) return void this.insert(child, phase)
    const old = this.current
    const text = this.text
    this.current = this.text = undefined
    this.swapOrKeep(child, old, text)
  }

  /**
   * The swap; if building the new content throws while the old is still
   * there (`in-out`, `together`), the old stays in charge. Once the old has
   * left (`out-in`), nothing is in charge: the region is empty.
   */
  private swapOrKeep(
    child: Child,
    old: Content | undefined,
    text?: Text,
  ): void {
    try {
      this.swap(child, old, ++this.version)
    } catch (error) {
      if (old && !old.life.signal.aborted)
        ((this.current = old), (this.text = text))
      throw error
    }
  }

  private swap(child: Child, old: Content | undefined, version: number): void {
    if (this.order === 'in-out')
      return void then(this.come(child), () => this.go(old))
    if (this.order === 'together') return void (this.come(child), this.go(old))
    const leaving = both(this.leaving, this.go(old))
    this.leaving = leaving
    then(leaving, () => this.after(child, version, leaving))
  }

  /** The `out-in` second half: only the latest change comes in. */
  private after(child: Child, version: number, leaving?: Promise<void>): void {
    if (this.leaving === leaving) this.leaving = undefined
    if (version !== this.version) return
    try {
      this.come(child)
    } catch (error) {
      reportError(error) // after the old left: nothing to go back to, the region stays empty
    }
  }

  /** The new content: in, its refs run, then its entry. */
  private come(child: Child): Promise<void> | undefined {
    const phase = new InsertedPhase()
    const content = this.insert(child, phase)
    phase.release()
    return this.motions.enter(rangeOf(content), content.life.signal)
  }

  /** The old content: its exit, then its life ends and its nodes leave. */
  private go(old: Content | undefined): Promise<void> | undefined {
    if (!old) return undefined
    const leaving = this.motions.leave(rangeOf(old), old.life.signal)
    return then(leaving, () => remove(old))
  }

  private updateText(child: Child): boolean {
    const text = textOf(child)
    if (text === undefined || !this.text) return false
    this.text.data = text
    return true
  }

  private insert(child: Child, phase: InsertedPhase): Content {
    const life = this.owner.child()
    const nodes = isNothing(child) ? [] : this.build(child, life, phase)
    this.text = isText(nodes) ? (nodes[0] as Text) : undefined
    const fragment = rangeFragment(nodes)
    this.current = contentOf(life, fragment)
    this.end.before(fragment)
    return this.current
  }
}

function contentOf(life: Life, fragment: DocumentFragment): Content {
  return { life, first: fragment.firstChild!, last: fragment.lastChild! }
}

/** Nodes as a fragment of at least one node, so they're a range even when empty. */
export function rangeFragment(nodes: Node[]): DocumentFragment {
  const fragment = document.createDocumentFragment()
  fragment.append(...(nodes.length > 0 ? nodes : [document.createComment('')]))
  return fragment
}

/** Run `next` after `waiting`, or right away when there's nothing to wait for. */
function then(
  waiting: Promise<void> | undefined,
  next: () => unknown,
): Promise<void> | undefined {
  if (!waiting) return void next()
  return waiting.then(() => void next()).catch(reportError)
}

function both(
  a: Promise<void> | undefined,
  b: Promise<void> | undefined,
): Promise<void> | undefined {
  if (!a || !b) return a ?? b
  return Promise.all([a, b]).then(() => {})
}

function remove(content: Content): void {
  content.life.end()
  for (const node of rangeOf(content)) node.parentNode?.removeChild(node)
}

/** The content's nodes now: inner regions' content included. */
export function rangeOf(content: { first: Node; last: Node }): Node[] {
  const nodes: Node[] = []
  for (let node: Node | null = content.first; node; node = node.nextSibling) {
    nodes.push(node)
    if (node === content.last) break
  }
  return nodes
}

function isText(nodes: Node[]): boolean {
  return nodes.length === 1 && nodes[0]!.nodeType === Node.TEXT_NODE
}
