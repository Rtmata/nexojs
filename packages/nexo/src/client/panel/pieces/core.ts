/** The `core` piece: its own import path, only what is public. */
export { attach, PANEL_ATTRIBUTE } from '../attach'
export { observe } from '../observe'
export { registry } from '../registry'
export type { PanelRegistry } from '../registry' // made by registry()
export type { Markup, PanelParams } from '../registry'
export { panel } from '../panel'
export type { EventHandler, Panel, PanelOptions } from '../panel'
// The parsers themselves are only `panel/params`, for a namespace import:
// a flat `number` would collide with terminal's and the app's own.
export type { Param, ParamsOf } from '../params'
