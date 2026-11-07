/** Scenarios for library.browser.test.ts: markup in, panels attached. */
import {
  activity,
  attach,
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
  ])
    document.addEventListener(name, (e) => w.events.push(describeEvent(e)))
}

function describeEvent(e: Event): string {
  const detail = (e as CustomEvent).detail ?? {}
  const extra =
    detail.pointerType ??
    detail.direction ??
    detail.action ??
    detail.state ??
    detail.phase
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
