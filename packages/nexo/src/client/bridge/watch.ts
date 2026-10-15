import { inherited } from './attributes'

/** How far ahead of the viewport "visible" starts: half a screen, so content is there before the user is. */
const MARGIN = '0px 0px 50% 0px'

/**
 * Elements that act when they come into view (`data-bridge-load="viewport"`,
 * `data-bridge-prefetch="viewport"`), or at once (`"eager"`). Each element
 * is taken once; new content is scanned as it arrives. A released element
 * counts again, but only after it has left the view: a failure never
 * retries in a loop while the element just sits there.
 */
export class Watch {
  private readonly taken = new WeakSet<Element>()
  /** Released elements still in view: they wait to leave it first. */
  private readonly resting = new WeakSet<Element>()
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

  /** Taken once more, when it comes into view again. */
  release(element: Element): void {
    this.taken.delete(element)
    this.resting.add(element)
    this.observer.observe(element)
  }

  private seen(entries: IntersectionObserverEntry[]): void {
    for (const { isIntersecting, target } of entries) {
      if (!isIntersecting) this.resting.delete(target)
      else if (!this.resting.has(target)) this.take(target)
    }
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
