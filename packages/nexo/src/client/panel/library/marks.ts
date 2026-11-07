/**
 * Attributes a panel writes over layer 0, remembered so the panel can take
 * them back when it ends: the markup returns to what the server sent.
 */
export class Marks {
  private readonly before = new Map<Element, Map<string, string | null>>()

  set(el: Element, name: string, value: string): void {
    const seen = this.before.get(el) ?? new Map<string, string | null>()
    if (!seen.has(name)) seen.set(name, el.getAttribute(name))
    this.before.set(el, seen)
    el.setAttribute(name, value)
  }

  /** A boolean attribute on or off (`hidden`), remembered the same way. */
  toggle(el: Element, name: string, on: boolean): void {
    this.set(el, name, '')
    if (!on) el.removeAttribute(name)
  }

  /** Writes it only where the author didn't. */
  default(el: Element, name: string, value: string): void {
    if (!el.hasAttribute(name)) this.set(el, name, value)
  }

  restore(): void {
    for (const [el, seen] of this.before)
      for (const [name, value] of seen)
        value === null ? el.removeAttribute(name) : el.setAttribute(name, value)
    this.before.clear()
  }
}
