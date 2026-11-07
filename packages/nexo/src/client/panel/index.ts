/**
 * panel: behaviors for markup that's already there (D). A panel is a plain
 * function of `(el, { signal })`, like omino's `ref`; `attach` connects the
 * ones markup names with `data-panel`. Imports no other module (A.1).
 */
export { attach, PANEL_ATTRIBUTE } from './attach'
export type { Registry } from './attach'
export { observe } from './observe'
export { panel } from './panel'
export type { EventHandler, Panel, PanelOptions } from './panel'
export { boolean, json, number, oneOf, string } from './params'
export type { Param, ParamsOf } from './params'
