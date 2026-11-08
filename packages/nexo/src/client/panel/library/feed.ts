import { panel } from '../panel'
import { number } from '../params'
import { Marks } from './marks'

/**
 * Feed (WAI-ARIA APG Feed): a list of articles that grows as the visitor
 * scrolls — the museum's infinite shelf. Layer 0 is the articles and a
 * "more" link; loading more is bridge's (`data-bridge-src` +
 * `data-bridge-load="viewport"` + `data-bridge-swap="append"`, which also
 * sets `aria-busy` while it loads). The panel gives the APG roles, numbers
 * the articles (`aria-posinset`, `aria-setsize`: the `total` param, else
 * -1, unknown) again whenever some arrive, and the APG keys: Page Down / Up
 * to the next / previous article, Ctrl+End / Ctrl+Home out of the feed.
 *
 *   <section data-panel="feed" data-feed-total="1200" aria-label="Shelf">
 *     <article aria-labelledby="g1-name">…</article>…
 *   </section>
 */
export const feed = panel({
  params: { total: number(-1) },
  connect: (el, { total }, { signal }) =>
    new Feed(el as HTMLElement, total, signal),
  events: { keydown: (event, ctx) => ctx.key(event as KeyboardEvent) },
})

class Feed {
  private readonly marks = new Marks()

  constructor(
    private readonly el: HTMLElement,
    private readonly total: number,
    signal: AbortSignal,
  ) {
    this.marks.set(el, 'role', 'feed')
    this.number()
    const watcher = new MutationObserver(() => this.number())
    watcher.observe(el, { childList: true, subtree: true })
    signal.addEventListener(
      'abort',
      () => (watcher.disconnect(), this.marks.restore()),
      { once: true },
    )
  }

  /** Each article focusable and numbered; the set's size if known. */
  private number(): void {
    this.articles().forEach((article, i) => {
      this.marks.default(article, 'tabindex', '0')
      this.marks.set(article, 'aria-posinset', String(i + 1))
      this.marks.set(article, 'aria-setsize', String(this.total))
    })
  }

  key(event: KeyboardEvent): void {
    const move = this.moveFor(event)
    if (!move) return
    event.preventDefault()
    move()
  }

  private moveFor(event: KeyboardEvent): (() => void) | undefined {
    if (event.key === 'PageDown') return () => this.step(1)
    if (event.key === 'PageUp') return () => this.step(-1)
    if (event.ctrlKey && event.key === 'End') return () => this.out(1)
    if (event.ctrlKey && event.key === 'Home') return () => this.out(-1)
    return undefined
  }

  /** The article around the focus, then the next or previous one. */
  private step(by: number): void {
    const articles = this.articles()
    const at = articles.findIndex((a) => a.contains(document.activeElement))
    articles[Math.min(articles.length - 1, Math.max(0, at + by))]?.focus()
  }

  /** The first visible focusable element after (or before) the whole feed. */
  private out(direction: 1 | -1): void {
    const outside = focusables().filter((e) => !this.el.contains(e))
    const target =
      direction === 1
        ? outside.find((e) => this.isAfter(e))
        : outside.filter((e) => !this.isAfter(e)).at(-1)
    target?.focus()
  }

  private isAfter(e: Element): boolean {
    return (
      (this.el.compareDocumentPosition(e) &
        Node.DOCUMENT_POSITION_FOLLOWING) !==
      0
    )
  }

  private articles(): HTMLElement[] {
    return [...this.el.querySelectorAll<HTMLElement>('article')].filter(
      (a) => a.parentElement?.closest('[role=feed]') === this.el,
    )
  }
}

/** What can take focus now: not inert, not hidden, rendered. */
function focusables(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (e) => !e.closest('[inert]') && isShown(e),
  )
}

function isShown(e: HTMLElement): boolean {
  return e.checkVisibility?.() ?? e.getClientRects().length > 0
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
