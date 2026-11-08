/**
 * Attributes a panel writes over layer 0, remembered so the panel can take
 * them back when it ends: the markup returns to what the server sent.
 *
 * Several panels may write the same attribute of one element (`data-panel=
 * "tokens gesture"`): what the server sent is recorded once, by the first
 * to touch it, and put back by the last to leave, whatever the order.
 */
export class Marks {
  private readonly touched = new Map<Element, Set<string>>()

  set(el: Element, name: string, value: string): void {
    this.claim(el, name)
    el.setAttribute(name, value)
  }

  /** A boolean attribute on or off (`hidden`), remembered the same way. */
  toggle(el: Element, name: string, on: boolean): void {
    this.claim(el, name)
    el.toggleAttribute(name, on)
  }

  remove(el: Element, name: string): void {
    this.claim(el, name)
    el.removeAttribute(name)
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
    this.claim(el, 'style')
    el.style.setProperty(name, value)
    el.style.cssText = el.style.cssText // settled now, not lazily (see `put`); CSSOM, so a strict CSP allows it
  }

  /** This panel holds the attribute; the server's value is recorded by whoever came first. */
  private claim(el: Element, name: string): void {
    const names = this.touched.get(el) ?? new Set<string>()
    names.add(name)
    this.touched.set(el, names)
    originalOf(el, name).holders.add(this)
  }

  /** Every attribute this panel touched goes back once no other panel holds it; `style` last. */
  restore(): void {
    for (const [el, names] of this.touched) {
      for (const name of names) if (name !== 'style') this.release(el, name)
      if (names.has('style')) this.release(el, 'style')
    }
    this.touched.clear()
  }

  private release(el: Element, name: string): void {
    const original = originals.get(el)?.get(name)
    if (!original) return
    original.holders.delete(this)
    if (original.holders.size > 0) return
    originals.get(el)!.delete(name)
    put(el, name, original.value)
  }
}

/** What the server sent for one attribute of one element, and the panels writing over it now. */
interface Original {
  value: string | null
  holders: Set<Marks>
}

const originals = new WeakMap<Element, Map<string, Original>>()

function originalOf(el: Element, name: string): Original {
  const map = originals.get(el) ?? new Map<string, Original>()
  originals.set(el, map)
  const known = map.get(name)
  if (known) return known
  const made = { value: el.getAttribute(name), holders: new Set<Marks>() }
  map.set(name, made)
  return made
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
