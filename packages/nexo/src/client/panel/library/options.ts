import type { Marks } from './marks'

let made = 0

/**
 * A list's options and the active one (APG's `aria-activedescendant`
 * model): focus stays on `controller` (the listbox itself, or combobox's
 * input) and the active option is named there. CSS styles it by
 * `[data-active]`. Shared by listbox and combobox.
 */
export class Options {
  constructor(
    private readonly list: HTMLElement,
    private readonly controller: HTMLElement,
    private readonly marks: Marks,
  ) {}

  all(): HTMLElement[] {
    return [...this.list.querySelectorAll<HTMLElement>('[role=option]')]
  }

  /** What keys move through: disabled and filtered-out (hidden) options are skipped. */
  enabled(): HTMLElement[] {
    return this.all().filter(
      (o) => !o.hidden && o.getAttribute('aria-disabled') !== 'true',
    )
  }

  /** No active option: nothing is named on the controller. */
  clear(): void {
    this.controller.removeAttribute('aria-activedescendant')
    for (const o of this.all()) o.removeAttribute('data-active')
  }

  get active(): HTMLElement | undefined {
    const id = this.controller.getAttribute('aria-activedescendant')
    return this.all().find((option) => option.id === id)
  }

  activate(option: HTMLElement | undefined): void {
    if (!option) return
    if (!option.id) this.marks.set(option, 'id', `option-${++made}`)
    this.marks.set(this.controller, 'aria-activedescendant', option.id)
    for (const o of this.all()) o.toggleAttribute('data-active', o === option)
    option.scrollIntoView?.({ block: 'nearest' })
  }

  /** The option `by` steps away, stopping at the ends; ±Infinity for first and last. */
  step(by: number): HTMLElement | undefined {
    const items = this.enabled()
    if (by === -Infinity) return items[0]
    if (by === Infinity) return items.at(-1)
    const at = items.indexOf(this.active!)
    if (at < 0) return by > 0 ? items[0] : items.at(-1)
    return items[Math.min(items.length - 1, Math.max(0, at + by))]
  }

  /** What an option stands for: `data-value`, else its text. */
  static valueOf(option: Element): string {
    return (
      option.getAttribute('data-value') ?? (option.textContent ?? '').trim()
    )
  }
}
