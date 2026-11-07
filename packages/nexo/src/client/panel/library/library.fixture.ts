/** Scenarios for library.browser.test.ts: markup in, panels attached. */
import { attach, focusgroup, registry } from '../index'

const panels = registry({ focusgroup })

export function setup(html: string): void {
  document.body.innerHTML = html
  attach(document.body, panels, { signal: new AbortController().signal })
}

export function roles(): (string | null)[] {
  return [...document.querySelectorAll('[focusgroup]')].map((g) =>
    g.getAttribute('role'),
  )
}
