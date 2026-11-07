/**
 * The built-in panels (D.4): industry patterns (WAI-ARIA APG, Open UI), each
 * enhancing the native element where one exists and working without JS.
 * Register them like your own: `registry({ focusgroup, tabs, gallery })`.
 */
export { FocusGroup, focusgroup, readSpec } from './focusgroup'
export type { FocusSpec } from './focusgroup'
export { tabs } from './tabs'
export { dialog } from './dialog'
export { feed } from './feed'
export { requestCloseTop } from './close-top'
