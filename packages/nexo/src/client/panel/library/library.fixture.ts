/** Scenarios for library.browser.test.ts: markup in, panels attached. */
import {
  activity,
  accordion,
  attach,
  carousel,
  splitter,
  tree,
  grid,
  hasSwitch,
  switchControl,
  toast,
  toastRegion,
  hasInterest,
  tooltip,
  menu,
  combobox,
  listbox,
  confirmOnHold,
  decode,
  indicator,
  replay,
  sequence,
  tokens,
  typewriter,
  dialog,
  feed,
  focusgroup,
  gesture,
  hoverIntent,
  keymap,
  pressHold,
  registry,
  requestCloseTop,
  slider,
  tabs,
} from '../index'

const panels = registry({
  dialog,
  feed,
  focusgroup,
  tabs,
  'press-hold': pressHold,
  'confirm-on-hold': confirmOnHold,
  gesture,
  slider,
  'hover-intent': hoverIntent,
  keymap,
  indicator,
  tokens,
  replay,
  activity,
  typewriter,
  decode,
  sequence,
  listbox,
  combobox,
  menu,
  tooltip,
  toast,
  accordion,
  switch: switchControl,
  grid,
  tree,
  carousel,
  splitter,
})

/** The panels of the previous scenario end with it: no listener outlives its markup. */
let current = new AbortController()

export function setup(html: string): void {
  current.abort()
  current = new AbortController()
  document.body.innerHTML = html
  attach(document.body, panels, { signal: current.signal })
}

export function roles(): (string | null)[] {
  return [...document.querySelectorAll('[focusgroup]')].map((g) =>
    g.getAttribute('role'),
  )
}

export function plain(html: string): void {
  document.body.innerHTML = html
}

/** Each panel: shown or hidden, and the selected tabs. */
export function tabsState() {
  return {
    shown: [...document.querySelectorAll('section')]
      .filter((s) => !s.hidden)
      .map((s) => s.id),
    selected: [
      ...document.querySelectorAll('[role=tab][aria-selected=true]'),
    ].map((t) => t.id || t.textContent),
    hash: location.hash,
    roles: [...document.querySelectorAll('[role]')].map((e) =>
      e.getAttribute('role'),
    ),
  }
}

/** As an engine that lacks them: the platform's features taken away before connecting. */
export function withoutPlatform(html: string, missing: string[]): void {
  const prototypes: Record<string, object> = {
    command: HTMLButtonElement.prototype,
    closedBy: HTMLDialogElement.prototype,
  }
  for (const name of missing)
    delete (prototypes[name] as Record<string, unknown>)[name]
  setup(html)
}

export function dialogState() {
  const d = document.querySelector('dialog')!
  return {
    open: d.open,
    labelledby: d.getAttribute('aria-labelledby'),
    focused: document.activeElement?.id ?? null,
  }
}

export function feedState() {
  const articles = [...document.querySelectorAll('article')]
  return {
    role: document.querySelector('[data-panel=feed]')!.getAttribute('role'),
    numbers: articles.map(
      (a) =>
        `${a.getAttribute('aria-posinset')}/${a.getAttribute('aria-setsize')}`,
    ),
    focused: document.activeElement?.id ?? null,
  }
}

/** What bridge's append swap does: more articles at the end. */
export async function moreArticles(): Promise<void> {
  const shelf = document.querySelector('[data-panel=feed]')!
  shelf.insertAdjacentHTML('beforeend', '<article id="g4"><h3>D</h3></article>')
  await new Promise((done) => setTimeout(done, 0))
}

export function closeTop() {
  const result = requestCloseTop()
  const open = [...document.querySelectorAll('dialog, [popover]')]
    .filter((el) => (el as HTMLElement).matches(':modal, :popover-open'))
    .map((el) => el.id)
  return { result, open }
}

/** Every panel event and click on the page, in order; listening starts once. */
export function record(): void {
  const w = window as any
  w.events = []
  if (w.listening) return
  w.listening = true
  for (const name of [
    'press-hold:press',
    'confirm-on-hold:confirm',
    'click',
    'gesture:tap',
    'gesture:swipe',
    'hover-intent:enter',
    'hover-intent:leave',
    'keymap:action',
    'activity:change',
    'typewriter:done',
    'decode:done',
    'sequence:phase',
    'sequence:done',
    'listbox:change',
    'combobox:change',
    'menu:select',
    'interest',
    'loseinterest',
    'toast:dismiss',
    'accordion:toggle',
    'grid:toggle',
    'tree:toggle',
    'tree:select',
    'carousel:change',
    'splitter:resize',
    'change',
  ])
    document.addEventListener(name, (e) => w.events.push(describeEvent(e)), {
      capture: NOT_BUBBLING.has(name),
    })
}

/** The platform's interest events don't bubble: heard in the capture phase. */
const NOT_BUBBLING = new Set(['interest', 'loseinterest'])

function describeEvent(e: Event): string {
  const detail = (e as CustomEvent).detail ?? {}
  const extra =
    detail.pointerType ??
    detail.direction ??
    detail.action ??
    detail.state ??
    detail.phase ??
    detail.values?.join(',') ??
    (detail.reason ? `${detail.text} ${detail.reason}` : undefined) ??
    (detail.open !== undefined ? `${detail.id}=${detail.open}` : undefined) ??
    (detail.index !== undefined ? String(detail.index) : undefined) ??
    (detail.size !== undefined
      ? `${detail.size}px ${detail.value}%`
      : undefined) ??
    (detail.expanded !== undefined
      ? `${detail.id}=${detail.expanded}`
      : undefined) ??
    detail.text ??
    (detail.checked === undefined
      ? detail.value
      : `${detail.value}=${detail.checked}`) ??
    (e.target as HTMLSelectElement).value
  return extra ? `${e.type} ${extra}` : e.type
}

export function events(): string[] {
  return (window as any).events
}

export function liveText(): string {
  return document.querySelector('[aria-live]')?.textContent ?? ''
}

export function styleOf(selector: string, name: string): string {
  return (
    document.querySelector(selector) as HTMLElement
  ).style.getPropertyValue(name)
}

export function attributes(
  selector: string,
  names: string[],
): Record<string, string | null> {
  const el = document.querySelector(selector)!
  return Object.fromEntries(names.map((n) => [n, el.getAttribute(n)]))
}

/** Attach, then end the panels: what they leave behind. */
export function setupAndEnd(html: string): void {
  document.body.innerHTML = html
  const controller = new AbortController()
  attach(document.body, panels, { signal: controller.signal })
  controller.abort()
}

export function animationTime(selector: string): number {
  const [animation] = document.querySelector(selector)!.getAnimations()
  return Number(animation?.currentTime ?? -1)
}

/** What a screen reader gets, and what the eye gets (the aria-hidden copy). */
export function texts(selector: string) {
  const el = document.querySelector(selector)!
  const shown = el.querySelector('[aria-hidden=true]')
  const spoken = [...el.childNodes].filter((n) => n !== shown)
  return {
    spoken: spoken.map((n) => n.textContent).join(''),
    shown: shown?.textContent ?? null,
  }
}

/** Starts a sequence that waits 80 ms more in its "step" phase, as a page load would. */
export function startSequence(selector: string): void {
  const el = document.querySelector(selector)!
  el.addEventListener('sequence:phase', (e) => {
    const { phase, waitUntil } = (e as CustomEvent).detail
    if (phase === 'step') waitUntil(new Promise((done) => setTimeout(done, 80)))
  })
  el.dispatchEvent(new Event('sequence:start'))
}

export function phaseOf(selector: string): string | null {
  return document.querySelector(selector)!.getAttribute('data-phase')
}

/** The listbox as a screen reader would get it. */
export function listboxState(selector = '[data-panel=listbox]') {
  const list = document.querySelector(selector)!
  const active = list.querySelector('[data-active]')
  const options = [...list.querySelectorAll('[role=option]')]
  return {
    role: list.getAttribute('role'),
    multi: list.getAttribute('aria-multiselectable'),
    selected: options
      .filter((o) => o.getAttribute('aria-selected') === 'true')
      .map((o) => o.textContent),
    active: active?.textContent ?? null,
    named: active
      ? list.getAttribute('aria-activedescendant') === active.id
      : null,
  }
}

/** The message a panel refuses some markup with: `attach` reports it as an uncaught error. */
export function setupError(html: string): string {
  let message = 'no error'
  const caught = (event: ErrorEvent) => {
    message = event.error?.message ?? event.message
    event.preventDefault()
  }
  window.addEventListener('error', caught)
  setup(html)
  window.removeEventListener('error', caught)
  return message
}

/** What the server would send back as the visitor types: titles containing the text. */
export function suggestOnInput(
  input: string,
  list: string,
  titles: string[],
): void {
  const field = document.querySelector<HTMLInputElement>(input)!
  const popup = document.querySelector(list)!
  field.addEventListener('input', () => {
    const text = field.value.toLowerCase()
    const found = text
      ? titles.filter((t) => t.toLowerCase().includes(text))
      : []
    popup.replaceChildren(
      ...found.map((t) =>
        Object.assign(document.createElement('li'), { textContent: t }),
      ),
    )
  })
}

/** The combobox as a screen reader gets it, and what its list shows. */
export function comboState(input = '[role=combobox]') {
  const field = document.querySelector<HTMLInputElement>(input)!
  const list = document.getElementById(field.getAttribute('aria-controls')!)!
  const active = list.querySelector('[data-active]')
  return {
    value: field.value,
    expanded: field.getAttribute('aria-expanded'),
    shown: [...list.querySelectorAll<HTMLElement>('[role=option]')]
      .filter((o) => !list.hidden && !o.hidden)
      .map((o) => o.textContent),
    active: active?.textContent ?? null,
    named: active
      ? field.getAttribute('aria-activedescendant') === active.id
      : null,
  }
}

export function selectState(selector: string) {
  const select = document.querySelector<HTMLSelectElement>(selector)!
  const label = document.querySelector(`label[for]`)
  const input = document.querySelector('[role=combobox]')
  return {
    value: select.value,
    hidden: select.hidden,
    labelled: label?.getAttribute('for') === input?.id,
  }
}

export function selectedText(): string {
  const field = document.activeElement as HTMLInputElement
  return field.value.slice(field.selectionStart ?? 0, field.selectionEnd ?? 0)
}

/** What has focus, which menus are open, and what the triggers say. */
export function menuState() {
  const focused = document.activeElement
  return {
    focused: focused?.id || focused?.textContent?.trim() || null,
    open: [...document.querySelectorAll('[popover]')]
      .filter((p) => p.matches(':popover-open'))
      .map((p) => p.id),
    expanded: [...document.querySelectorAll('[aria-haspopup]')].map(
      (t) =>
        `${t.id || t.textContent?.trim()}:${t.getAttribute('aria-expanded')}`,
    ),
  }
}

export function rolesOf(selector: string): (string | null)[] {
  return [...document.querySelectorAll(selector)].map((e) =>
    e.getAttribute('role'),
  )
}

/** A frame or two: the popover `toggle` event is queued as a task. */
export function settled(): Promise<void> {
  return new Promise((done) => setTimeout(done, 30))
}

/** Whether this engine has interest invokers (the panel then does nothing). */
export function nativeInterest(): boolean {
  return hasInterest()
}

export function tipState(tip = '#tip', invoker = '#info') {
  const t = document.querySelector(tip)!
  const i = document.querySelector(invoker)!
  return {
    open: t.matches(':popover-open'),
    role: t.getAttribute('role'),
    describedby: i.getAttribute('aria-describedby'),
    details: i.getAttribute('aria-details'),
    expanded: i.getAttribute('aria-expanded'),
  }
}

/** What the app does to say something: a message into the region in use. */
export function say(html: string): void {
  toastRegion()!.insertAdjacentHTML('beforeend', `<li>${html}</li>`)
}

export function messages(selector = '[data-panel~=toast]'): string[] {
  return [...document.querySelector(selector)!.children].map((m) => {
    const copy = m.cloneNode(true) as HTMLElement
    const close = copy.querySelector('[data-toast-dismiss]')
    const label = close?.getAttribute('aria-label')
    close?.remove()
    return `${copy.textContent!.trim()}${label ? ` [${label}]` : ''}`
  })
}

export function regionInUse(): string | null {
  return toastRegion()?.id ?? null
}

export function openModal(id: string): void {
  ;(document.getElementById(id) as HTMLDialogElement).showModal()
}

export function openSections(): string[] {
  return [...document.querySelectorAll('details')]
    .filter((d) => d.open)
    .map((d) => d.id)
}

export function toggleSection(id: string): void {
  const details = document.getElementById(id) as HTMLDetailsElement
  details.open = !details.open
}

export function sessionValue(key: string): string | null {
  return sessionStorage.getItem(key)
}

export function nativeSwitch(): boolean {
  return hasSwitch()
}

/** Like `withoutPlatform`, for a property that lives on an input. */
export function withoutSwitch(html: string): void {
  delete (HTMLInputElement.prototype as unknown as Record<string, unknown>)
    .switch
  setup(html)
}

/** Where focus is in a grid: "row:cell" indexes, or the text of a focused widget. */
export function gridFocus(): string | null {
  const active = document.activeElement as HTMLElement | null
  const cell = active?.closest<HTMLTableCellElement>('td, th')
  const row = active?.closest<HTMLTableRowElement>('tr')
  if (!row) return null
  const place = cell
    ? `${row.rowIndex}:${cell.cellIndex}`
    : `row ${row.rowIndex}`
  return active !== cell && active !== row
    ? `${place} ${active!.textContent?.trim() || active!.localName}`
    : place
}

export function visibleRows(): string[] {
  return [...document.querySelectorAll<HTMLTableRowElement>('tbody tr')]
    .filter((r) => !r.hidden)
    .map((r) => r.id)
}

export function tabStops(): string[] {
  return [...document.querySelectorAll<HTMLElement>('[tabindex="0"]')].map(
    (e) => e.id || e.textContent!.trim(),
  )
}

export function treeFocus(): string | null {
  const active = document.activeElement as HTMLElement | null
  if (!active?.closest('[role=tree]')) return null
  const text = [...active.childNodes]
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent!.trim())
    .join('')
  return `${active.localName} ${text || active.textContent!.trim()}`
}

export function visibleItems(): string[] {
  return [...document.querySelectorAll<HTMLElement>('[role=treeitem]')]
    .filter(
      (i) =>
        !i.closest('li')!.hidden &&
        !i.closest('li')!.parentElement!.closest('li')?.hidden,
    )
    .map((i) => i.id)
}

export function carouselState() {
  const slides = [
    ...document.querySelectorAll<HTMLElement>('[data-carousel-slides] > *'),
  ]
  const toggle = document.querySelector('[data-carousel-toggle]')
  return {
    current: slides.findIndex((s) => s.hasAttribute('data-current')),
    labels: slides.map((s) => s.getAttribute('aria-label')),
    toggle: toggle?.getAttribute('aria-label') ?? null,
    live: document
      .querySelector('[data-carousel-slides]')!
      .getAttribute('aria-live'),
    scrollLeft: document.querySelector('[data-carousel-slides]')!.scrollLeft,
  }
}

export function splitterState() {
  const sep = document.querySelector<HTMLElement>('[data-panel=splitter]')!
  return {
    role: sep.getAttribute('role'),
    now: sep.getAttribute('aria-valuenow'),
    size: sep.parentElement!.style.getPropertyValue('--splitter-size'),
    width: Math.round(
      document
        .getElementById(sep.getAttribute('aria-controls')!)!
        .getBoundingClientRect().width,
    ),
    collapsed: sep.hasAttribute('data-collapsed'),
  }
}
