/**
 * terminal: typed commands between a client and a server or Tauri (A.2,
 * F.1). One shared table; `client(transport).exec(name, args, { signal })`;
 * `serve(handlers)` for keep. Imports no other module (A.1).
 */
export * from './pieces/client'
export * from './pieces/terminal'
export * from './pieces/errors'
export * from './pieces/http'
export * from './pieces/validators'
export * from './pieces/server'
export * from './pieces/tauri'
