import type { Child } from './element'
import { isHole, readerOf, type ReadableLike } from './hole'

/** What `For` lists: a `Readable` of an array, a function, or a `SignalArray`. */
export type ForEach<T> =
  ReadableLike<readonly T[]> | (() => readonly T[]) | Iterable<T>

export interface ForProps<T> {
  each: ForEach<T>
  /**
   * What makes two items the same row. The item itself by default (Solid
   * `For`); `(_, i) => i` lists by position (Solid `Index`).
   */
  key?: (item: T, index: number) => unknown
  /**
   * Reordered rows slide to their new place (E.2). `move` lets CSS do it
   * (`[data-moving] { transition: translate 0.3s }`); a function gets the
   * rows' elements and the reorder to run (theater's `moves(…)`), so it
   * picks the moment: measure, `update()`, animate. If it returns a
   * promise or a View Transition (`startViewTransition(update)` calls it
   * later), the list waits for it; then, or at once, if `update` wasn't
   * called the list runs it. Rows read their new `item` and `index` from
   * the start, also while a move holds them in their old places. omino
   * imports nothing for it: the function is a plain value.
   */
  move?: boolean | ((rows: Element[], update: () => void) => unknown)
  /** Called once per row, untracked; `item` and `index` change in place. */
  children: (item: ReadableLike<T>, index: ReadableLike<number>) => Child
  if?: unknown
  slot?: string
}

/**
 * A keyed list (C.14):
 *
 *   <For each={books} key={(book) => book.id}>
 *     {(book, index) => <li>{() => book.get().title}</li>}
 *   </For>
 *
 * Each row is made once per key. In the browser a new object under the same
 * key updates that row's `item`, a reorder moves its nodes, a row that leaves
 * ends. On the server the list is read once.
 */
export class For<T> {
  constructor(readonly props: ForProps<T>) {}

  /** The server's way: every item once, as fixed values. */
  template(): Child {
    return itemsOf(this.props.each).map((item, index) =>
      this.props.children(fixed(item), fixed(index)),
    )
  }
}

/** The items now, read the way `each` was given. */
export function itemsOf<T>(each: ForEach<T>): readonly T[] {
  if (isHole(each)) return readerOf(each)()
  return [...(each as Iterable<T>)]
}

/** How to read `each` again: a hole as is, an iterable through a copy. */
export function readEach<T>(each: ForEach<T>): () => readonly T[] {
  if (isHole(each)) return readerOf(each)
  return () => [...(each as Iterable<T>)]
}

function fixed<T>(value: T): ReadableLike<T> {
  return { get: () => value }
}
