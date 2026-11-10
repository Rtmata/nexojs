import type { Child } from '../../shared/omino/element'
import type { ForProps } from '../../shared/omino/for'
import { InsertedPhase, type Life } from './life'
import type { ReactiveValue, Reactivity } from './reactivity'
import type { Motions } from './motions'
import { rangeFragment, rangeOf, type BuildInto } from './region'
import { cssMove, elementsIn } from './row-moves'

/** One row: made once per key, its nodes between `first` and `last`. */
interface Row<T> {
  key: unknown
  item: ReactiveValue<T>
  index: ReactiveValue<number>
  life: Life
  first: Node
  last: Node
  /** A new row's nodes, until they're placed. */
  fresh?: DocumentFragment
}

/**
 * A keyed region (C.14): rows by key, each with its own life and its own
 * `item` and `index` signals. A new object under a key sets that row's
 * `item`; a reorder moves nodes (fewest moves: the rows already in order
 * stay); a leaving row ends. ONE path: a diff of keys, no events.
 */
export class ForList<T> {
  private readonly start = document.createComment('')
  private readonly end = document.createComment('')
  private rows = new Map<unknown, Row<T>>()
  private order: Row<T>[] = []

  constructor(
    private readonly props: ForProps<T>,
    private readonly owner: Life,
    private readonly build: BuildInto,
    private readonly reactivity: Reactivity,
    private readonly motions: Motions,
    /** The phase of the tree being built: the first rows' refs wait on it. */
    private firstPhase?: InsertedPhase,
  ) {}

  nodes(): Node[] {
    const fragment = document.createDocumentFragment()
    fragment.append(this.start, this.end)
    return [fragment]
  }

  update(items: readonly T[]): void {
    const first = this.firstPhase
    this.firstPhase = undefined
    const phase = first ?? new InsertedPhase()
    const next = this.reactivity.batch(() => this.rowsFor(items, phase))
    const fresh = next.filter((row) => row.fresh)
    this.reconcile(next)
    if (!first) this.welcome(fresh, phase)
  }

  private reconcile(next: Row<T>[]): void {
    const reorder = () => (this.leave(next), this.place(next))
    const move = this.props.move
    if (move && this.order.length > 0) this.moveRows(move, reorder)
    else reorder()
    this.order = next
  }

  /** E.2: the kept rows slide, by CSS (`move`) or by the given function. */
  private moveRows(
    move: NonNullable<ForProps<T>['move']>,
    reorder: () => void,
  ): void {
    const rows = this.order.flatMap((row) => elementsIn(rangeOf(row)))
    if (typeof move === 'function') move(rows, reorder)
    else cssMove(rows, reorder)
  }

  /** New rows after the first update: their refs run, then their entry. */
  private welcome(fresh: Row<T>[], phase: InsertedPhase): void {
    phase.release()
    for (const row of fresh) this.motions.enter(rangeOf(row), row.life.signal)
  }

  /** Every item's row: the one it had, updated, or a new one. */
  private rowsFor(items: readonly T[], phase: InsertedPhase): Row<T>[] {
    const seen = new Set<unknown>()
    const keys = items.map((item, index) => this.keyOf(item, index, seen)) // all checked first: a duplicate builds nothing
    const built: Row<T>[] = []
    try {
      return items.map((item, i) => this.rowFor(keys[i], item, i, phase, built))
    } catch (error) {
      for (const row of built) row.life.end() // a template that threw: what was built for this pass ends with it
      throw error
    }
  }

  private rowFor(
    key: unknown,
    item: T,
    index: number,
    phase: InsertedPhase,
    built: Row<T>[],
  ): Row<T> {
    const row = this.rows.get(key)
    if (row) return (row.item.set(item), row.index.set(index), row)
    const made = this.row(key, item, index, phase)
    built.push(made)
    return made
  }

  private keyOf(item: T, index: number, seen: Set<unknown>): unknown {
    const key = this.props.key ? this.props.key(item, index) : item
    if (seen.has(key))
      throw new Error(
        `omino: <For> has two items with the key ${String(key)}. Keys tell rows apart: give each item its own`,
      )
    seen.add(key)
    return key
  }

  private row(
    key: unknown,
    item: T,
    index: number,
    phase: InsertedPhase,
  ): Row<T> {
    const { signal } = this.reactivity
    const life = this.owner.child()
    const row = { key, item: signal(item), index: signal(index), life }
    const fresh = this.content(row.item, row.index, life, phase)
    return { ...row, first: fresh.firstChild!, last: fresh.lastChild!, fresh }
  }

  /** Called once, untracked (C.14); an empty row still has a place. */
  private content(
    item: ReactiveValue<T>,
    index: ReactiveValue<number>,
    life: Life,
    phase: InsertedPhase,
  ) {
    const tree = this.reactivity.untrack(() =>
      this.props.children(view(item), view(index)),
    )
    return rangeFragment(this.build(tree, life, phase))
  }

  /** Rows whose key is gone play their exit, then end and leave (C.15c). */
  private leave(next: Row<T>[]): void {
    const kept = new Set(next.map((row) => row.key))
    for (const row of this.order) if (!kept.has(row.key)) this.goes(row)
    this.rows = new Map(next.map((row) => [row.key, row]))
  }

  private goes(row: Row<T>): void {
    const done = () => removeRow(row)
    const leaving = this.motions.leave(rangeOf(row), row.life.signal)
    if (leaving) leaving.then(done, reportError)
    else done()
  }

  /** From the end: each row goes before the next one, unless it already stays. */
  private place(next: Row<T>[]): void {
    const stays = staying(this.order, next)
    let before: Node = this.end
    for (let i = next.length - 1; i >= 0; i--) {
      const row = next[i]!
      if (!stays.has(row)) insert(row, before)
      before = row.first
    }
  }
}

/** The rows that keep their place: the longest run already in the old order. */
function staying<T>(old: Row<T>[], next: Row<T>[]): Set<Row<T>> {
  const at = new Map(old.map((row, i) => [row, i]))
  const kept = next.filter((row) => at.has(row))
  const run = longestIncreasing(kept.map((row) => at.get(row)!))
  return new Set(run.map((i) => kept[i]!))
}

/** Indexes of a longest strictly increasing subsequence (patience sorting). */
function longestIncreasing(values: number[]): number[] {
  const tails: number[] = []
  const previous: number[] = []
  values.forEach((value, i) => {
    const at = firstNotBelow(tails, values, value)
    previous[i] = at > 0 ? tails[at - 1]! : -1
    tails[at] = i
  })
  return walkBack(tails, previous)
}

function firstNotBelow(
  tails: number[],
  values: number[],
  value: number,
): number {
  let low = 0
  let high = tails.length
  while (low < high) {
    const middle = (low + high) >> 1
    if (values[tails[middle]!]! < value) low = middle + 1
    else high = middle
  }
  return low
}

function walkBack(tails: number[], previous: number[]): number[] {
  const run: number[] = []
  for (let i = tails.at(-1) ?? -1; i >= 0; i = previous[i]!) run.unshift(i)
  return run
}

/** A new row's nodes from its fragment; a kept one's, moved (`moveBefore` keeps their state). */
function insert<T>(row: Row<T>, before: Node): void {
  if (row.fresh) before.parentNode!.insertBefore(row.fresh, before)
  else for (const node of rangeOf(row)) move(node, before)
  row.fresh = undefined
}

function move(node: Node, before: Node): void {
  const parent = before.parentNode as ParentNode & Node
  if ('moveBefore' in parent && parent.isConnected)
    (parent as any).moveBefore(node, before)
  else parent.insertBefore(node, before)
}

function removeRow<T>(row: Row<T>): void {
  row.life.end()
  for (const node of rangeOf(row)) node.parentNode?.removeChild(node)
}

/** The row's signal, read-only for the row's code. */
function view<T>(value: ReactiveValue<T>) {
  return { get: () => value.get(), peek: () => value.peek() }
}
