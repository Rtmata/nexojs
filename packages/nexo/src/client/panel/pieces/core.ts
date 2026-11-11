/** The `core` piece: its own import path (A.1b), only what is public. */
export { attach, PANEL_ATTRIBUTE } from '../attach'
export type { Registry } from '../attach'
export { observe } from '../observe'
export { registry } from '../registry'
export type { PanelRegistry } from '../registry' // made by registry() (audit item 12)
export type { Markup, PanelParams } from '../registry'
export { panel } from '../panel'
export type { EventHandler, Panel, PanelOptions } from '../panel'
// The parsers themselves are only `panel/params`, for a namespace import:
// a flat `number` would collide with terminal's and the app's own.
export type { Param, ParamsOf } from '../params'
