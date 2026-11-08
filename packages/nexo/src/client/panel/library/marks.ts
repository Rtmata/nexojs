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

  /**
   * An inline style or custom property (`--slider-fill`). What's remembered
   * is the whole `style` attribute as the server sent it, so restoring puts
   * it back verbatim (no stray `style=""` or reformatted text).
   */
  style(el: HTMLElement, name: string, value: string): void {
    const seen = this.before.get(el) ?? new Map<string, string | null>()
    if (!seen.has('style')) seen.set('style', el.getAttribute('style'))
    this.before.set(el, seen)
    el.style.setProperty(name, value)
    el.style.cssText = el.style.cssText // settled now, not lazily (see `put`); CSSOM, so a strict CSP allows it
  }

  /** Every attribute back, `style` last: a later attribute change would resurrect a removed one (WebKit). */
  restore(): void {
    for (const [el, seen] of this.before) {
      for (const [name, value] of seen)
        if (name !== 'style') put(el, name, value)
      if (seen.has('style')) put(el, 'style', seen.get('style')!)
    }
    this.before.clear()
  }
}

/**
 * Back to the original attribute, or none. A `style` written through
 * `el.style` is serialized lazily: reading the attribute first settles it,
 * or Chromium and WebKit bring back a bare `style=""` after the removal
 * (measured 2026-11; Firefox doesn't).
 */
function put(el: Element, name: string, value: string | null): void {
  if (name === 'style') return putStyle(el as HTMLElement, value)
  if (value === null) el.removeAttribute(name)
  else el.setAttribute(name, value)
}

/**
 * The server's `style` back verbatim (a page that sent one allows inline
 * styles). None sent: emptied through the CSSOM (allowed under a strict
 * CSP), settled, removed.
 */
function putStyle(el: HTMLElement, value: string | null): void {
  if (value !== null) return el.setAttribute('style', value)
  el.style.cssText = ''
  void el.getAttribute('style')
  el.removeAttribute('style')
}
