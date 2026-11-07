/** How long typed characters keep building one search (APG: "in quick succession"). */
const QUIET = 500

/**
 * APG typeahead, shared by listbox, combobox's popup, menu and tree: a
 * typed character goes to the next item whose text starts with it; several
 * typed quickly match the whole string.
 */
export class Typeahead {
  private typed = ''
  private timer?: ReturnType<typeof setTimeout>

  /** Where this key goes; `undefined` when it isn't a printed character or nothing matches. */
  find<T extends Element>(key: string, items: T[], from?: T): T | undefined {
    if (key.length !== 1 || (key === ' ' && !this.typed)) return undefined
    this.remember(key)
    const here = Math.max(0, items.indexOf(from as T))
    const start = this.typed.length === 1 ? here + 1 : here
    const order = [...items.slice(start), ...items.slice(0, start)]
    return order.find((item) => textOf(item).startsWith(this.typed))
  }

  private remember(key: string): void {
    clearTimeout(this.timer)
    this.typed += key.toLowerCase()
    this.timer = setTimeout(() => (this.typed = ''), QUIET)
  }
}

function textOf(item: Element): string {
  return (item.textContent ?? '').trim().toLowerCase()
}
