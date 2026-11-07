import type { Child } from '../../shared/omino/element'
import { isNothing, textOf } from '../../shared/omino/leaf'
import { InsertedPhase, type Life } from './life'

/** Builds a child into nodes, living on `life`; their refs wait on `phase`. */
export type BuildInto = (
  child: Child,
  life: Life,
  phase: InsertedPhase,
) => Node[]

/**
 * A hole that returns JSX (C.12): a place between two markers, replaced whole
 * when the hole changes. Text stays one text node and only its data changes.
 * The content has its own life, ended when it's replaced.
 */
export class Region {
  private readonly start = document.createComment('')
  private readonly end = document.createComment('')
  private life?: Life
  private text?: Text

  constructor(
    private readonly owner: Life,
    private readonly build: BuildInto,
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
    this.clear()
    const phase = this.firstPhase ?? new InsertedPhase()
    this.insert(child, phase)
    if (this.firstPhase) this.firstPhase = undefined
    else phase.release()
  }

  private updateText(child: Child): boolean {
    const text = textOf(child)
    if (text === undefined || !this.text) return false
    this.text.data = text
    return true
  }

  private insert(child: Child, phase: InsertedPhase): void {
    this.life = this.owner.child()
    const nodes = isNothing(child) ? [] : this.build(child, this.life, phase)
    this.text = isText(nodes) ? (nodes[0] as Text) : undefined
    this.end.before(...nodes)
  }

  /** The old content's life ends, then its nodes leave. */
  private clear(): void {
    this.life?.end()
    while (this.start.nextSibling && this.start.nextSibling !== this.end)
      this.start.nextSibling.remove()
    this.text = undefined
  }
}

function isText(nodes: Node[]): boolean {
  return nodes.length === 1 && nodes[0]!.nodeType === Node.TEXT_NODE
}
