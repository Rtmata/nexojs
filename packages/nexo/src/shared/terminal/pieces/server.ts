/** The `server` piece: its own import path (A.1b), only what is public. */
export type { CommandServer } from '../server' // made by terminal().serve() (audit item 12)
export type { Handlers, Run, ServeHooks } from '../server'
