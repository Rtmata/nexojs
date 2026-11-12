# @nexoamigos/nexo

A no-magic, server-first full-stack framework for [Bun](https://bun.sh). Zero runtime dependencies: every piece is built on web standards (`Request`, `Response`, `URL`, the DOM) and can be read like a book.

> **Status:** early development, not published yet.

Each module is independent and imported on its own. Its README sits next to its code:

| Module      | Import                       | What it is                                                    | Docs                                         |
| ----------- | ---------------------------- | ------------------------------------------------------------- | -------------------------------------------- |
| `keep`      | `@nexoamigos/nexo/keep`      | The server: requests in, responses out, static files, safety  | [src/server/keep](src/server/keep)           |
| `boat`      | `@nexoamigos/nexo/boat`      | The router: routes, params, languages, links                  | [src/shared/boat](src/shared/boat)           |
| `omino`     | `@nexoamigos/nexo/omino`     | JSX components, rendered on the server and in the browser     | [src/shared/omino](src/shared/omino)         |
| `bridge`    | `@nexoamigos/nexo/bridge`    | Navigation in the browser by segments of the page             | [src/client/bridge](src/client/bridge)       |
| `connector` | `@nexoamigos/nexo/connector` | State that tells who read it: signals, effects, async, events | [src/shared/connector](src/shared/connector) |
| `panel`     | `@nexoamigos/nexo/panel`     | Behaviour attached to server HTML, and a library of patterns  | [src/client/panel](src/client/panel)         |
| `terminal`  | `@nexoamigos/nexo/terminal`  | Typed commands between a client and a server or Tauri         | [src/shared/terminal](src/shared/terminal)   |
| `theater`   | `@nexoamigos/nexo/theater`   | Motion: animations, springs, scroll, layout changes           | [src/client/theater](src/client/theater)     |
| `glyph`     | `@nexoamigos/nexo/glyph`     | Styles: tokens, themes, recipes, fonts, as plain CSS          | [src/shared/glyph](src/shared/glyph)         |
| `voices`    | `@nexoamigos/nexo/voices`    | Translations checked across languages                         | [src/shared/voices](src/shared/voices)       |
| `quarry`    | `@nexoamigos/nexo/quarry`    | Formatting: numbers, dates, sizes, durations, names           | [src/shared/quarry](src/shared/quarry)       |
| `witness`   | `@nexoamigos/nexo/witness`   | Development: reload on change                                 | [src/server/witness](src/server/witness)     |

The names come from the island of _The Witness_: a request lands at a **dock**, enters the **keep**, and the **boat** carries it to its destination, where **omino** pieces assemble the page while the **witness** watches; the **bridge** extends segment by segment. **connector** and **terminal** come from _The Talos Principle_: a connector takes a beam and passes it on, as a change passes from signal to signal; a terminal is where you send a command and get an answer. **panel**, **theater** and **glyph** are the island again: the panels you solve, the cinema of moving pictures, the symbols drawn on every panel.

How the code is written: [CONTRIBUTING.md](../../CONTRIBUTING.md). License: [MIT](../../LICENSE).
