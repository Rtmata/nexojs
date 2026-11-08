import { panel } from '../panel'
import { boolean } from '../params'
import { emit } from './hold'
import { Marks } from './marks'
import { Options } from './options'
import { Typeahead } from './typeahead'

/**
 * Listbox (WAI-ARIA APG Listbox) over a plain list, for choices that
 * aren't a form's (R.38: in a form, native radios or checkboxes). Options
 * are `[role=option]`, else the list's children. Focus stays on the list
 * (`aria-activedescendant`); `[data-active]` marks the active option for
 * CSS. Single: selection follows the arrows. Multiple
 * (`data-listbox-multiple` or `aria-multiselectable="true"`): APG's
 * recommended keys — Space, Shift+arrows, Shift+Space, Ctrl+Shift+Home/End,
 * Ctrl+A. Typeahead in both. `listbox:change` carries `{ value, values }`
 * (`data-value`, else the text).
 *
 *   <ul data-panel="listbox" aria-label="Platform"><li>SNES</li><li>Mega Drive</li></ul>
 */
export const listbox = panel({
  params: { multiple: boolean() },
  connect: (el, { multiple }, { signal }) =>
    new Listbox(el as HTMLElement, multiple, signal),
  events: {
    keydown: (e, list) => list.key(e as KeyboardEvent),
    'click [role=option]': (e, list, option) =>
      list.clicked(e as MouseEvent, option as HTMLElement),
    focus: (_e, list) => list.focused(),
  },
})

/** A key's handler; `false` when it didn't apply (the key goes on to typeahead). */
type Keys = Record<
  string,
  (list: Listbox, event: KeyboardEvent) => boolean | void
>

const MOVES: Record<string, number> = {
  ArrowDown: 1,
  ArrowUp: -1,
  Home: -Infinity,
  End: Infinity,
}

/** APG's recommended multi-select model, by key. */
const MULTI: Keys = {
  ' ': (list, e) => (e.shiftKey ? list.range() : list.toggle()),
  a: (list, e) => (e.ctrlKey || e.metaKey) && list.all(),
}

export class Listbox {
  readonly multiple: boolean
  private readonly marks = new Marks()
  private readonly options: Options
  private readonly typeahead = new Typeahead()
  private anchor?: HTMLElement

  constructor(
    private readonly el: HTMLElement,
    multiple: boolean,
    signal: AbortSignal,
  ) {
    this.multiple =
      multiple || el.getAttribute('aria-multiselectable') === 'true'
    this.options = new Options(el, el, this.marks)
    this.prepare()
    signal.addEventListener('abort', () => this.marks.restore(), { once: true })
  }

  /** Roles and states on layer 0's plain list. */
  private prepare(): void {
    this.marks.set(this.el, 'role', 'listbox')
    this.marks.default(this.el, 'tabindex', '0')
    if (this.multiple) this.marks.set(this.el, 'aria-multiselectable', 'true')
    const children = this.el.querySelector('[role=option]')
      ? []
      : [...this.el.children]
    for (const child of children) this.marks.set(child, 'role', 'option')
    for (const option of this.options.all())
      this.marks.default(option, 'aria-selected', 'false')
  }

  focused(): void {
    if (this.options.active) return
    const selected = this.options.enabled().find(isSelected)
    this.options.activate(selected ?? this.options.step(1))
  }

  key(event: KeyboardEvent): void {
    const handled = this.handle(event)
    if (handled) event.preventDefault()
  }

  private handle(event: KeyboardEvent): boolean {
    const by = MOVES[event.key]
    if (by !== undefined) return this.moved(by, event)
    const multi = this.multiple ? MULTI[event.key] : undefined
    if (multi && multi(this, event) !== false) return true
    if (event.ctrlKey || event.altKey || event.metaKey) return false
    return this.typed(event.key)
  }

  private typed(key: string): boolean {
    const { options } = this
    const found = this.typeahead.find(key, options.enabled(), options.active)
    if (found) this.go(found)
    return found !== undefined
  }

  /** Arrows and Home/End; with Shift (multiple), they select on the way. */
  private moved(by: number, event: KeyboardEvent): boolean {
    const from = this.options.active
    const to = this.options.step(by)
    if (!to) return false
    this.options.activate(to)
    if (!this.multiple) this.choose([to], to)
    else if (event.shiftKey) this.extend(from, to, event)
    return true
  }

  private extend(
    from: HTMLElement | undefined,
    to: HTMLElement,
    event: KeyboardEvent,
  ): void {
    if (event.ctrlKey && Math.abs(MOVES[event.key]!) === Infinity)
      this.rangeFrom(from ?? to, to)
    else this.flip(to)
  }

  private go(option: HTMLElement): void {
    this.options.activate(option)
    if (!this.multiple) this.choose([option], option)
  }

  clicked(event: MouseEvent, option: HTMLElement): void {
    if (option.getAttribute('aria-disabled') === 'true') return
    this.options.activate(option)
    if (!this.multiple) return this.choose([option], option)
    if (event.shiftKey) this.range()
    else this.flip(option)
  }

  toggle(): void {
    const active = this.options.active
    if (active) this.flip(active)
  }

  /** Shift+Space: everything from the last toggled option to the active one. */
  range(): void {
    const active = this.options.active
    if (active) this.rangeFrom(this.anchor ?? active, active)
  }

  /** Ctrl+A: every option, or none when every one already is. */
  all(): void {
    const enabled = this.options.enabled()
    const every = enabled.every(isSelected)
    this.choose(every ? [] : enabled, this.options.active)
  }

  private flip(option: HTMLElement): void {
    this.anchor = option
    const others = this.selected().filter((o) => o !== option)
    this.choose(isSelected(option) ? others : [...others, option], option)
  }

  private rangeFrom(from: HTMLElement, to: HTMLElement): void {
    const enabled = this.options.enabled()
    const [a, b] = [enabled.indexOf(from), enabled.indexOf(to)].sort(
      (x, y) => x - y,
    )
    const span = enabled.slice(a, b + 1)
    this.choose([...new Set([...this.selected(), ...span])], to)
  }

  private selected(): HTMLElement[] {
    return this.options.all().filter(isSelected)
  }

  /** The selection is now exactly `chosen`; `listbox:change` when it changed. */
  private choose(chosen: HTMLElement[], about: HTMLElement | undefined): void {
    const before = this.selected()
    for (const option of this.options.all())
      this.marks.set(option, 'aria-selected', String(chosen.includes(option)))
    if (sameSet(before, chosen)) return
    const values = this.selected().map(Options.valueOf)
    const value = about ? Options.valueOf(about) : undefined
    emit(this.el, 'listbox:change', { value, values })
  }
}

function isSelected(option: Element): boolean {
  return option.getAttribute('aria-selected') === 'true'
}

function sameSet(a: Element[], b: Element[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x))
}
