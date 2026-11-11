/** The `resolve` piece: its own import path (A.1b), only what is public. */
export { resolve } from '../resolve'
export type { PropertyName, ResolvedTokens } from '../resolve' // ResolvedTokens is made by resolve(): a type only (audit item 12)
