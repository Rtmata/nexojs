# terminal

Typed commands between a client and a server, or a Tauri app's Rust side: one shared table, validated on arrival, with errors declared per command.

## At a glance

```ts
import { keep } from '@nexoamigos/nexo/keep'
import { http, isCommandError, terminal } from '@nexoamigos/nexo/terminal'
import * as v from '@nexoamigos/nexo/terminal/validators'

// shared by both sides
export const api = terminal({
  book: {
    args: v.object({ id: v.number() }),
    result: v.custom<{ title: string }>(),
    errors: { notFound: { status: 404 } },
    read: true,
  },
})

// the server, with keep
keep({ router }).use(
  api.serve({
    book: ({ id }, { fail }) =>
      id === 1 ? { title: 'Street Fighter II' } : fail('notFound'),
  }),
)

// the browser
const commands = api.client(http())
await commands.exec('book', { id: 1 }) // { title: 'Street Fighter II' }
try {
  await commands.exec('book', { id: 2 })
} catch (e) {
  if (isCommandError(e, 'notFound')) show('No such book') // e.status === 404
}
await commands.exec('book', { id: 'x' }) // TS error; at runtime: "terminal: book: id: expected a number"
```

## Setup

The table is a plain module both sides import. `api.client(transport)` makes the client; `api.serve(handlers)` makes the server's hook for keep (or for anything that calls `onRequest({ request })`). terminal imports no other module.

## The table

Each command may declare:

- `args`: what it takes, a schema. Without it, the command takes none.
- `result`: what it gives, a schema; `v.custom<T>()` when the other side is trusted.
- `errors`: the failures it may answer with, each with its HTTP status and, maybe, a `data` schema: `{ notFound: { status: 404 } }`.
- `read: true`: it has no side effects, so it also answers `GET` and can be cached.

Schemas are **Standard Schema**: Valibot, Zod, ArkType or any library that meets it plugs in with no adapter. terminal ships small validators of its own, imported as a namespace: `object`, `array`, `string`, `number`, `boolean`, `optional`, `nullable`, `oneOf`, `custom`.

## The client

- `commands.exec(name, args, { signal })` is a plain promise. Args are checked before they leave, so a mistake fails at the call.
- It rejects with a `CommandError` (`code`, `message`, `data`, `status`). `isCommandError(e, 'notFound')` narrows it; with no code, it tells any command error.
- Aborting the signal stops waiting and, over HTTP, cancels the request.

## Transports

- **`http({ base, fetch })`:** `POST /_nexo/terminal/<name>` with JSON args. A `read` command goes as `GET /_nexo/terminal/<name>?args=…`. A declared error comes back with its status and `{ code, message, data }`. No reply at all (offline, DNS, CORS) is a `CommandError` with code `unreachable`, and a 2xx that isn't JSON (a captive portal's page) is `internal`.
- **`tauri({ invoke })`:** pass Tauri's `invoke` as a value; terminal imports no Tauri package. Rust already checks the types, so `v.custom<T>()` is enough. A rejected `{ kind, message }` becomes a `CommandError` with `code = kind`. Tauri can't cancel an `invoke`: aborting stops waiting while the Rust command keeps running.
- **Your own:** a transport is any `{ send(call, { signal }) }`.

## The server

- Handlers get `(args, { fail, signal, request })`. `fail('notFound', data?)` answers with a declared error, typed by the table. `signal` aborts when the caller gives up.
- Args are **always** validated: an invalid one gets `400` with `invalidArgs` and the issues' messages and paths, never the rejected input. The handler never runs.
- Anything not declared, such as a bug, reaches the client as `internal` with no message or stack, and is reported on the server.
- The codes terminal answers by itself: `invalidArgs` 400, `forbidden` 403, `unknownCommand` 404, `methodNotAllowed` 405, `unsupportedMediaType` 415, `internal` 500.
- Commands are posted as `application/json` only, a type another site's form can't send without a preflight that nothing answers. A `GET` is accepted only for `read` commands, and refused when it is another site's navigation.

## Why it works this way

- **One table both sides import.** The client can't call a command the server doesn't have, or send the wrong args, and a Tauri app's Rust commands fit the same table. Importing the server's types into the client was set aside: a Rust side has no TS types to import.
- **The server always validates.** Types alone would trust anything that arrives from the internet. A schema per command, in the same table, closes that without a build step that generates validation.
- **Errors are declared, and the rest are masked.** The client handles `notFound` by its code, not by comparing text, and a bug never leaks a server message. A failure is a rejection, not a result value, so `resource` and `try` work as usual.
- **POST by default, GET only when declared.** Reads can be cached; writes can't be triggered from another site. A JSON-RPC-style protocol, which answers every error with status 200, was set aside.
- **Transports are values.** HTTP, Tauri, or a test's own fetch plug in the same way, and terminal never imports what it talks to.
