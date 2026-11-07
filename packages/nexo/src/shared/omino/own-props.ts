/**
 * Nexo's own JSX props on elements: they're for the browser, never
 * attributes. The server leaves them out; the client uses them.
 * `ref` (C.17a), `enter`/`exit`/`exit-timeout` (C.15c), `prop:…` (R.13).
 */
const OWN = new Set(['ref', 'enter', 'exit', 'exit-timeout'])

export function isOwnProp(name: string): boolean {
  return OWN.has(name) || name.startsWith('prop:')
}
