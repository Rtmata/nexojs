/** How long typed characters keep building one search (APG: "in quick succession"). */
const QUIET = 500

/**
 * APG typeahead, shared by listbox, combobox's popup, menu and tree: a
 * typed character goes to the next item whose label starts with it;
 * several typed quickly match the whole string, and one character typed
 * again and again cycles through the items starting with it. Labels are
 * the item's text with whitespace collapsed, or what `labelOf` says (a
 * tree item's own line, not its children's).
 */
export class Typeahead {
  private typed = ''
  private timer?: ReturnType<typeof setTimeout>

  constructor(
    signal?: AbortSignal,
    private readonly labelOf: (item: Element) => string = textOf,
  ) {
    signal?.addEventListener('abort', () => clearTimeout(this.timer), {
      once: true,
    })
  }

  /** Where this key goes; `undefined` when it isn't a printed character or nothing matches. */
  find<T extends Element>(key: string, items: T[], from?: T): T | undefined {
    if (key.length !== 1 || (key === ' ' && !this.typed)) return undefined
    this.remember(key)
    const here = from ? items.indexOf(from) : -1
    const wanted = this.repeated() ? this.typed[0]! : this.typed
    const start = wanted.length === 1 ? here + 1 : Math.max(0, here)
    const order = [...items.slice(start), ...items.slice(0, start)]
    return order.find((item) => this.labelOf(item).startsWith(wanted))
  }

  /** `aaa`: the same character again means "the next one starting with a". */
  private repeated(): boolean {
    return (
      this.typed.length > 1 && [...this.typed].every((c) => c === this.typed[0])
    )
  }

  private remember(key: string): void {
    clearTimeout(this.timer)
    this.typed += key.toLowerCase()
    this.timer = setTimeout(() => (this.typed = ''), QUIET)
  }
}

/** An element's text as a label: whitespace collapsed, lower case. */
export function textOf(item: Element): string {
  return (item.textContent ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
}
