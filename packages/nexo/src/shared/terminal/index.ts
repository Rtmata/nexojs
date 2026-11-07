/**
 * terminal: typed commands between a client and a server or Tauri (A.2,
 * F.1). One shared table; `client(transport).exec(name, args, { signal })`;
 * `serve(handlers)` for keep. Imports no other module (A.1).
 */
export { Client } from './client'
export type { Call, ExecOptions, Transport } from './client'
export type {
  ArgsOf,
  CommandSpec,
  ErrorSpec,
  Fail,
  ResultOf,
  Table,
} from './contract'
export { CommandError, isCommandError } from './errors'
export type { ReservedCode } from './errors'
export { http } from './http'
export type { HttpOptions } from './http'
export {
  array,
  boolean,
  nullable,
  number,
  object,
  oneOf,
  optional,
  string,
  type,
} from './schema'
export type { Issue, Output, StandardSchemaV1 } from './schema'
export { CommandServer } from './server'
export type { Handlers, Run, ServeHooks } from './server'
export { tauri } from './tauri'
export type { Invoke } from './tauri'
export { Terminal, terminal } from './terminal'
