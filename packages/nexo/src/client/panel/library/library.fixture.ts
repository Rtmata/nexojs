/** Scenarios for library.browser.test.ts: markup in, panels attached. */
import {
  attach,
  confirmOnHold,
  dialog,
  feed,
  focusgroup,
  pressHold,
  registry,
  requestCloseTop,
  tabs,
} from '../index'

const panels = registry({
  dialog,
  feed,
  focusgroup,
  tabs,
  'press-hold': pressHold,
  'confirm-on-hold': confirmOnHold,
})

export function setup(html: string): void {
  document.body.innerHTML = html
  attach(document.body, panels, { signal: new AbortController().signal })
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
  for (const name of ['press-hold:press', 'confirm-on-hold:confirm', 'click'])
    document.addEventListener(name, (e) => w.events.push(describeEvent(e)))
}

function describeEvent(e: Event): string {
  const pointerType = (e as CustomEvent).detail?.pointerType
  return pointerType ? `${e.type} ${pointerType}` : e.type
}

export function events(): string[] {
  return (window as any).events
}

export function liveText(): string {
  return document.querySelector('[aria-live]')?.textContent ?? ''
}
