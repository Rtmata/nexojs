/**
 * Nexo's own JSX props on elements: they're for the browser, never
 * attributes. The server leaves them out; the client uses them.
 * `ref`, `enter`/`exit`/`exit-timeout`, `prop:…`,
 * `bind:…` and `bind-on`.
 */
const OWN = new Set(['ref', 'enter', 'exit', 'exit-timeout', 'bind-on'])

export function isOwnProp(name: string): boolean {
  return OWN.has(name) || name.startsWith('prop:') || name.startsWith('bind:')
}
