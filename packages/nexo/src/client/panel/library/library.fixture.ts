/** Scenarios for library.browser.test.ts: markup in, panels attached. */
import { attach, focusgroup, registry, tabs } from '../index'

const panels = registry({ focusgroup, tabs })

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
