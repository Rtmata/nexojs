import type { Marks } from './marks'

let made = 0

/**
 * The filterable select (R.39, GOV.UK accessible-autocomplete's
 * progressive enhancement): layer 0 is the `<select>`, which sends the
 * option's value without JS. The panel puts a text input and a list made
 * from its options after it, hides it, and writes every choice back to it.
 */
export class SelectSource {
  readonly input: HTMLInputElement
  readonly list: HTMLUListElement

  constructor(
    readonly select: HTMLSelectElement,
    marks: Marks,
    signal: AbortSignal,
  ) {
    this.input = inputFor(select, marks)
    this.list = listFor(select)
    select.after(this.input, this.list)
    marks.toggle(select, 'hidden', true)
    signal.addEventListener('abort', () => this.remove(), { once: true })
  }

  /** The select's chosen option's text: what the input shows. */
  shown(): string {
    return this.select.selectedOptions[0]?.text ?? ''
  }

  /** A choice made in the combobox becomes the select's, with its events. */
  choose(value: string): void {
    if (this.select.value === value) return
    this.select.value = value
    this.select.dispatchEvent(new Event('input', { bubbles: true }))
    this.select.dispatchEvent(new Event('change', { bubbles: true }))
  }

  private remove(): void {
    this.input.remove()
    this.list.remove()
  }
}

/** A text input named as the select was: its label now points here. */
function inputFor(select: HTMLSelectElement, marks: Marks): HTMLInputElement {
  const input = document.createElement('input')
  input.type = 'text'
  input.id = `${select.id || 'combobox'}-input-${++made}`
  input.value = select.selectedOptions[0]?.text ?? ''
  for (const name of ['aria-label', 'aria-labelledby', 'aria-describedby'])
    if (select.hasAttribute(name))
      input.setAttribute(name, select.getAttribute(name)!)
  for (const label of select.labels) marks.set(label, 'for', input.id)
  return input
}

/** One list item per option: its value, its text, disabled kept. */
function listFor(select: HTMLSelectElement): HTMLUListElement {
  const list = document.createElement('ul')
  list.id = `${select.id || 'combobox'}-list-${made}`
  list.hidden = true
  for (const option of select.options) list.append(itemFor(option))
  return list
}

function itemFor(option: HTMLOptionElement): HTMLLIElement {
  const item = document.createElement('li')
  item.dataset.value = option.value
  item.textContent = option.text
  if (option.disabled) item.setAttribute('aria-disabled', 'true')
  return item
}
