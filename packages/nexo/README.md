# @nexoamigos/nexo

A no-magic, server-first full-stack framework for [Bun](https://bun.sh). Zero runtime dependencies: every piece is built on web standards (`Request`, `Response`, `URL`, the DOM) and can be read like a book.

> **Status:** early development, not published yet.

Each module is independent and imported on its own. Its README sits next to its code:

| Module      | Import                       | What it is                                                    | Docs                                         |
| ----------- | ---------------------------- | ------------------------------------------------------------- | -------------------------------------------- |
| `keep`      | `@nexoamigos/nexo/keep`      | The server: requests in, responses out, static files, safety  | [src/server/keep](src/server/keep)           |
| `boat`      | `@nexoamigos/nexo/boat`      | The router: routes, params, languages, links                  | [src/shared/boat](src/shared/boat)           |
| `omino`     | `@nexoamigos/nexo/omino`     | JSX components rendered on the server                         | [src/shared/omino](src/shared/omino)         |
| `bridge`    | `@nexoamigos/nexo/bridge`    | Navigation in the browser by segments of the page             | [src/client/bridge](src/client/bridge)       |
| `voices`    | `@nexoamigos/nexo/voices`    | Translations checked across languages                         | [src/shared/voices](src/shared/voices)       |
| `quarry`    | `@nexoamigos/nexo/quarry`    | Formatting: numbers, dates, sizes, durations, names           | [src/shared/quarry](src/shared/quarry)       |
| `connector` | `@nexoamigos/nexo/connector` | State that tells who read it: signals, effects, async, events | [src/shared/connector](src/shared/connector) |
| `witness`   | `@nexoamigos/nexo/witness`   | Development: reload on change                                 | [src/server/witness](src/server/witness)     |

The names come from the island of _The Witness_: a request lands at a **dock**, enters the **keep**, and the **boat** carries it to its destination, where **omino** pieces assemble the page while the **witness** watches; the **bridge** extends segment by segment. **connector** comes from _The Talos Principle_: a connector takes a beam and passes it on, as a change passes from signal to signal.

How the code is written: [CONTRIBUTING.md](../../CONTRIBUTING.md). License: [MIT](../../LICENSE).
