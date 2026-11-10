/** Marks a row while CSS slides it to its new place (E.2). */
export const MOVING = 'data-moving'

/** The elements among a row's nodes. */
export function elementsIn(nodes: Node[]): Element[] {
  return nodes.filter((node): node is Element => node instanceof Element)
}

/** What a row had inline before the move borrowed it. */
interface Borrowed {
  translate: string
  transition: string
}

/**
 * Rows slide by CSS (E.2, Vue's move-class model): measure, reorder, put
 * each moved row back where it was with an inline `translate` and no
 * transition, let the browser lay that out once, then hand the row to
 * the page's `[data-moving] { transition: translate … }`, which plays it
 * home. The mark goes when its transition ends.
 */
export function cssMove(rows: Element[], reorder: () => void): void {
  const before = new Map(rows.map((el) => [el, el.getBoundingClientRect()]))
  reorder()
  const moved = rows.flatMap((el) => invert(el as HTMLElement, before.get(el)!))
  if (moved.length === 0) return
  void document.body.offsetHeight // one layout: the inverted places are the start
  for (const [el, borrowed] of moved) release(el, borrowed)
}

/** Back to its old place, without a transition; nothing when it didn't move. */
function invert(el: HTMLElement, first: DOMRect): [HTMLElement, Borrowed][] {
  if (!el.isConnected) return []
  const last = el.getBoundingClientRect()
  const [dx, dy] = [first.left - last.left, first.top - last.top]
  if (dx === 0 && dy === 0) return []
  const borrowed = {
    translate: el.style.translate,
    transition: el.style.transition,
  }
  hold(el, `${dx}px ${dy}px`)
  return [[el, borrowed]]
}

function hold(el: HTMLElement, translate: string): void {
  el.setAttribute(MOVING, '')
  el.style.transition = 'none'
  el.style.translate = translate
}

/**
 * Each row's latest move (module state, one entry per sliding row): a
 * reorder during a slide cancels the slide, and that cancelled slide's
 * end must not take the mark off the slide that replaced it.
 */
const latestMove = new WeakMap<Element, object>()

/** Gives the row back to CSS, and drops the mark when its slide ends, unless a newer move has it by then. */
function release(el: HTMLElement, borrowed: Borrowed): void {
  const move = {}
  latestMove.set(el, move)
  el.style.transition = borrowed.transition
  el.style.translate = borrowed.translate
  const slides = el.getAnimations().map((a) => a.finished.catch(() => {}))
  Promise.all(slides).then(() => {
    if (latestMove.get(el) === move) el.removeAttribute(MOVING)
  })
}
