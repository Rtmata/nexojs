/**
 * terminal: typed commands between a client and a server or Tauri. One
 * shared table; `client(transport).exec(name, args, { signal })`;
 * `serve(handlers)` for keep. Imports no other module.
 */
export * from './pieces/client'
export * from './pieces/terminal'
export * from './pieces/errors'
export * from './pieces/http'
// The validators are only `terminal/validators`, for a namespace import:
// a flat `number` would collide with panel's and the app's own.
export type { Issue, Output, StandardSchemaV1 } from './pieces/validators'
export * from './pieces/server'
export * from './pieces/tauri'
