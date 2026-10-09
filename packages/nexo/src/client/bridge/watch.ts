import { inherited } from './attributes'

/** How far ahead of the viewport "visible" starts: half a screen, so content is there before the user is. */
const MARGIN = '0px 0px 50% 0px'

/**
 * Elements that act when they come into view (`data-bridge-load="viewport"`,
 * `data-bridge-prefetch="viewport"`), or at once (`"eager"`). Each element
 * is taken once; new content is scanned as it arrives.
 */
export class Watch {
  private readonly taken = new WeakSet<Element>()
  private readonly observer = new IntersectionObserver(
    (entries) => this.seen(entries),
    { rootMargin: MARGIN },
  )

  constructor(
    private readonly selector: string,
    private readonly role: string,
    private readonly act: (element: Element) => void,
  ) {}

  scan(root: ParentNode): void {
    for (const element of candidates(root, this.selector)) {
      if (this.taken.has(element)) continue
      const when = inherited(element, this.role)
      if (when === 'eager') this.take(element)
      else if (when === 'viewport') this.observer.observe(element)
    }
  }

  private seen(entries: IntersectionObserverEntry[]): void {
    for (const entry of entries)
      if (entry.isIntersecting) this.take(entry.target)
  }

  private take(element: Element): void {
    this.observer.unobserve(element)
    if (this.taken.has(element)) return
    this.taken.add(element)
    this.act(element)
  }
}

/** The root itself when it matches, plus everything matching inside it. */
export function candidates(root: ParentNode, selector: string): Element[] {
  const inside = [...root.querySelectorAll(selector)]
  const self = root instanceof Element && root.matches(selector) ? [root] : []
  return [...self, ...inside]
}
