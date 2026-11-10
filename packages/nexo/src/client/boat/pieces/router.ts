/** The `router` piece: its own import path (A.1b), only what is public. */
export { boat } from '../router'
export type { ClientRouter } from '../router' // made by boat(): a type, not a second way to create it (audit item 12)
export type { BoatClientOptions } from '../router'
export type { Reactivity } from '../reactivity'
