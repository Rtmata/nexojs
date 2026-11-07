import { panel } from '../panel'
import { oneOf } from '../params'
import { SelectSource } from './combobox-select'
import { emit } from './hold'
import { Marks } from './marks'
import { Options } from './options'

/**
 * Combobox (WAI-ARIA APG Combobox, R.39). The element decides:
 * - `<input type="text">`: free text with suggestions in the list its
 *   `aria-controls` names; the app or bridge may fill that list as the
 *   visitor types (then `data-combobox-filter="none"`). Layer 0 sends the
 *   typed text.
 * - `<select>`: a filterable select. Layer 0 is the select; the panel adds
 *   an input and a list from its options and keeps the select in sync.
 *
 * `aria-autocomplete` picks APG's variant: `none`, `list` (default) or
 * `both` (inline completion; the highlighted suggestion is taken when
 * focus leaves). Focus stays in the input (`aria-activedescendant`).
 * `combobox:change` carries `{ value, text }`.
 *
 *   <input name="q" data-panel="combobox" aria-controls="titles" aria-label="Search">
 *   <ul id="titles" hidden></ul>
 */
export const combobox = panel({
  params: { filter: oneOf(['contains', 'starts', 'none'], 'contains') },
  connect: (el, { filter }, { signal }) => start(el, filter, signal),
})

type Filter = 'contains' | 'starts' | 'none'

function start(el: Element, filter: Filter, signal: AbortSignal): void {
  const marks = new Marks()
  signal.addEventListener('abort', () => marks.restore(), { once: true })
  const setup: Setup = { el, filter, marks }
  if (el instanceof HTMLSelectElement) return fromSelect(el, setup, signal)
  const input = textInput(el)
  new Combobox(input, popupOf(input), setup, signal)
}

function fromSelect(
  select: HTMLSelectElement,
  setup: Setup,
  signal: AbortSignal,
): void {
  const source = new SelectSource(select, setup.marks, signal)
  new Combobox(source.input, source.list, { ...setup, source }, signal)
}

/** ARIA in HTML: only `type=text` may be a combobox (`search` must stay `searchbox`). */
function textInput(el: Element): HTMLInputElement {
  if (el instanceof HTMLInputElement && el.type === 'text') return el
  throw new Error(
    `combobox: data-panel="combobox" goes on <input type="text"> or <select>, not ${describe(el)}`,
  )
}

function describe(el: Element): string {
  return el instanceof HTMLInputElement
    ? `<input type="${el.type}">`
    : `<${el.localName}>`
}

function popupOf(input: HTMLInputElement): HTMLElement {
  const id = input.getAttribute('aria-controls') ?? ''
  const list = document.getElementById(id)
  if (list) return list
  throw new Error(
    `combobox: aria-controls="${id}" names no element; it should name the suggestions list`,
  )
}

interface Setup {
  el: Element
  filter: Filter
  marks: Marks
  source?: SelectSource
}

type Keys = Record<string, (box: Combobox, event: KeyboardEvent) => boolean>

const KEYS: Keys = {
  ArrowDown: (box, e) => box.down(e.altKey),
  ArrowUp: (box) => box.up(),
  Enter: (box) => box.enter(),
  Escape: (box) => box.escape(),
}

class Combobox {
  private readonly options: Options
  private readonly marks: Marks

  constructor(
    private readonly input: HTMLInputElement,
    private readonly list: HTMLElement,
    private readonly setup: Setup,
    signal: AbortSignal,
  ) {
    this.marks = setup.marks
    this.options = new Options(list, input, this.marks)
    this.prepare()
    this.listen(signal)
  }

  private get mode(): string {
    return this.input.getAttribute('aria-autocomplete') ?? 'list'
  }

  private prepare(): void {
    const { input, list, marks } = this
    marks.set(input, 'role', 'combobox')
    marks.set(input, 'aria-expanded', 'false')
    marks.default(input, 'aria-controls', list.id)
    marks.default(input, 'aria-autocomplete', 'list')
    marks.default(input, 'autocomplete', 'off')
    marks.set(list, 'role', 'listbox')
    this.roles()
  }

  /** Every item of the list is an option, those the app adds later too. */
  private roles(): void {
    for (const child of this.list.children)
      if (!child.hasAttribute('role')) this.marks.set(child, 'role', 'option')
  }

  private listen(signal: AbortSignal): void {
    const on = { signal }
    this.input.addEventListener('input', (e) => this.typed(e as InputEvent), on)
    this.input.addEventListener('keydown', (e) => this.key(e), on)
    this.input.addEventListener('focusout', (e) => this.left(e), on)
    this.list.addEventListener('pointerdown', (e) => e.preventDefault(), on)
    this.list.addEventListener('click', (e) => this.picked(e), on)
    const added = new MutationObserver(() => this.arrived())
    added.observe(this.list, { childList: true })
    signal.addEventListener('abort', () => added.disconnect(), { once: true })
  }

  private key(event: KeyboardEvent): void {
    if (KEYS[event.key]?.(this, event)) event.preventDefault()
  }

  /** ↓ opens and moves into the list; Alt+↓ only opens (APG). */
  down(altKey: boolean): boolean {
    const wasOpen = this.isOpen()
    this.open()
    if (!altKey)
      this.options.activate(wasOpen ? this.options.step(1) : this.firstActive())
    return true
  }

  up(): boolean {
    this.open()
    this.options.activate(
      this.options.step(this.options.active ? -1 : Infinity),
    )
    return true
  }

  /** Enter takes the active suggestion; with none, the form submits as usual. */
  enter(): boolean {
    const active = this.isOpen() ? this.options.active : undefined
    if (active) this.accept(active)
    return active !== undefined
  }

  /** Escape closes; closed, it clears the text (free text only, APG's option). */
  escape(): boolean {
    if (this.isOpen()) return (this.close(), true)
    if (this.setup.source || !this.input.value) return false
    this.input.value = ''
    this.refresh()
    return true
  }

  private typed(event: InputEvent): void {
    this.refresh()
    if (this.mode === 'both' && event.inputType?.startsWith('insert'))
      this.complete()
  }

  /** The list was filled (by the app, or bridge): roles, then shown if it has any. */
  private arrived(): void {
    this.roles()
    if (document.activeElement === this.input) this.refresh()
  }

  /** Filtered to the text, open when anything is left. */
  private refresh(): void {
    this.filter()
    this.options.clear()
    if (this.options.enabled().length && this.input.value) this.open()
    else this.close()
  }

  private filter(): void {
    const { filter } = this.setup
    if (filter === 'none' || this.mode === 'none') return
    const text = this.input.value.trim().toLowerCase()
    for (const option of this.options.all())
      this.marks.toggle(option, 'hidden', !matches(option, text, filter))
  }

  /** `both`: the rest of the first suggestion, written in and selected (APG). */
  private complete(): void {
    const typed = this.input.value
    const first = this.options
      .enabled()
      .find((o) => textOf(o).toLowerCase().startsWith(typed.toLowerCase()))
    if (!first) return
    this.options.activate(first)
    this.input.value = typed + textOf(first).slice(typed.length)
    this.input.setSelectionRange(typed.length, this.input.value.length)
  }

  private picked(event: Event): void {
    const option = (event.target as Element).closest<HTMLElement>(
      '[role=option]',
    )
    if (option && option.getAttribute('aria-disabled') !== 'true')
      this.accept(option)
  }

  private accept(option: HTMLElement): void {
    this.input.value = textOf(option)
    this.setup.source?.choose(Options.valueOf(option))
    this.close()
    emit(this.setup.el, 'combobox:change', {
      value: Options.valueOf(option),
      text: this.input.value,
    })
  }

  /** Leaving: closed; `both` takes the highlighted suggestion; a select never keeps a stray text. */
  private left(event: FocusEvent): void {
    if (this.list.contains(event.relatedTarget as Node | null)) return
    const active =
      this.mode === 'both' && this.isOpen() ? this.options.active : undefined
    if (active) return this.accept(active)
    this.close()
    this.settleSelect()
  }

  /** A select's input shows a real choice: the exact name typed, else the select's own. */
  private settleSelect(): void {
    const source = this.setup.source
    if (!source) return
    const typed = this.input.value.trim().toLowerCase()
    const named = this.options
      .all()
      .find((o) => textOf(o).toLowerCase() === typed)
    if (named && named.getAttribute('aria-disabled') !== 'true')
      this.accept(named)
    else this.input.value = source.shown()
  }

  /** The suggestion ↓ starts on: the chosen one, else the first. */
  private firstActive(): HTMLElement | undefined {
    const text = this.input.value.trim().toLowerCase()
    return (
      this.options.enabled().find((o) => textOf(o).toLowerCase() === text) ??
      this.options.step(1)
    )
  }

  private isOpen(): boolean {
    return !this.list.hidden
  }

  private open(): void {
    if (!this.options.enabled().length) return
    this.marks.toggle(this.list, 'hidden', false)
    this.input.setAttribute('aria-expanded', 'true')
  }

  private close(): void {
    this.marks.toggle(this.list, 'hidden', true)
    this.input.setAttribute('aria-expanded', 'false')
    this.options.clear()
  }
}

function textOf(option: Element): string {
  return (option.textContent ?? '').trim()
}

function matches(option: Element, text: string, filter: Filter): boolean {
  const name = textOf(option).toLowerCase()
  return filter === 'starts' ? name.startsWith(text) : name.includes(text)
}
