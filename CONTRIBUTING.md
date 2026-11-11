# Contributing to Nexo

This guide describes how Nexo's code is written. It applies to every module.

## Principles

1. **No magic.** Every behavior can be traced by hand to the line that causes it. No hidden proxies, no import side effects, no code rewriting.
2. **Written to be read.** Nexo's source is part of its documentation: someone who wants to go further than the docs (the "high ceiling") should be able to open any file and follow it like a book. Write for that reader.
3. **Readability and debuggability first.** A long, clear name beats a short, clever one. Code is read and debugged far more often than it is written.
4. **No patches.** When a fix needs a special case, a flag or an extra branch, the design is wrong: restructure instead. Code that is simple to understand is simple to test and simple to fix.
5. **Look like the neighborhood.** New code follows the style of the code around it, even where you would have chosen differently.
6. **Independent modules.** Every module works on its own. Modules connect through plain values visible at the call site (lists, functions, `Request`/`Response`), never by requiring each other. Shared internals that aren't public live in `src/shared/<topic>/` (e.g. `url/decode.ts`, `lang/tag.ts`, `http/not-found.ts`, `markup/vocabulary.ts` for the words two modules write and read in HTML) or `src/client/<topic>/` (`settle/`). The decided exceptions: panel's effect panels wrap theater's pieces (Phase 6, A.1), and theater's `follow` piece builds on connector (B.6) — no other theater piece imports it.
7. **Explicit runtime boundaries.** Code that only runs on the server lives in `src/server/`; code that runs anywhere in `src/shared/`. Code that needs a browser lives in `src/client/`. Bun-specific code lives only in `src/server/dock/`.

## Design principles

- **SOLID**, as Nexo applies it:
  - _Single responsibility_: each class does one thing (`RouteTable` stores and finds routes; `Links` builds URLs).
  - _Open–closed_: extend by adding, not by editing. A new way to read the language is a new reader class; existing readers don't change.
  - _Liskov substitution_: anything that meets a contract works where the contract is asked for (any `KeepRouter` works in `keep`).
  - _Interface segregation_: contracts ask only for what they use (`KeepRouter` lists five members, not the whole router).
  - _Dependency inversion_: modules depend on contracts and plain values, not on each other (`keep` takes a `KeepRouter`, not `boat`).
- **KISS**: the simplest design that works. If a reviewer needs a diagram, simplify.
- **DRY**: one rule, one place. Logic shared by modules lives in `src/shared/<topic>/` (e.g. one way to compare language tags).
- **Named patterns**: when a class follows a known pattern, its doc comment says so (_strategy_, _chain of responsibility_, _facade_…), so readers recognize it.
- **Performance-critical modules** (motion, graphics, signal graphs): hot paths may use data-oriented design — compact data plus systems that walk it, in the spirit of Unity's DOTS — decided per module when it arrives. Compact data needs a measurement that justifies it, and the size limits still apply.

## Structure

- **Public API:** one entry function per module, named after it (`boat()`, `keep()`, `quarry()`, `voices()`), or classes when users extend them (`Component`) or construct them as they would the platform's own (`new SignalArray()`, like `new Map()`). A class a function returns is exported as a type only (`type ClientRouter`): one way to create each thing.
- **Public imports:** per module (`@nexoamigos/nexo/panel`) or per piece (`@nexoamigos/nexo/panel/tabs`) — A.1b. A piece's path is its file name in the module's `pieces/` folder (`panel/tabs` is `pieces/tabs.ts`, `theater/easing/back` is `pieces/easing/back.ts`): `package.json` maps each folder with one pattern, `"./panel/*"` → `./src/client/panel/pieces/*.ts`, so a new piece is only a new file. That file is small and re-exports only what is public, and it is named after what it gives (`theater/animate-view` gives `animateView`, `theater/easing` the easing families); the module's index only lists its pieces. Exact keys are kept for what is not a piece — the module's index, omino's JSX runtimes, bridge's served script — and win over the patterns, in Node as in Bun. Theater's `flashes` and `test-clock` are exact keys too, with their files outside `pieces/`: they run beside the browser in a Playwright test, so they get no `nexo-built` browser build. A module whose whole API is one entry function (`quarry`, `voices`, `keep`, `witness`, bridge's server side) has no `pieces/`: its index is its one path. Nothing acts on import (`sideEffects` names bridge's script, the one exception), so a bundler keeps only what you use; `scripts/pieces.test.ts` guards it, and `scripts/exports.test.ts` that every piece resolves by its path.
- **Inside a module:** small classes, each with one responsibility, composed by the module's entry function. A class that needs two sentences to describe does two things: split it.
- **Composition by default.** Inheritance only for a real "is a" relationship (a component is a `Component`).
- **State marks vs settings:** what an element _is_ right now is a state, unprefixed as HTML's own (`data-active`, `data-exiting`, `data-dragging`, `data-in-view`); what an author _writes_ — a setting or a part — carries its owner's prefix (`data-tabs-orientation`, `data-toast-dismiss`, `data-bridge-target`). Information a module writes on `<html>` about what is happening keeps its prefix (`data-bridge-direction`).
- **Boolean attributes** of Nexo's own (`data-bridge-*`, `data-<panel>-*`) are HTML's: present means yes (a bare attribute is enough), `"false"` means no. ARIA attributes keep ARIA's own `"true"` / `"false"`.
- **Time is milliseconds**, in every option of every module, as in JavaScript itself (`setTimeout`, Node's `keepAliveTimeout`, Fastify's timeouts). A module that hands time to something counting seconds (Bun's `idleTimeout`, HTTP's `max-age`) converts inside. Docs write long ones as a product: `24 * 60 * 60 * 1000`.
- **Families of small builders** (panel's param parsers, terminal's validators) are used through a namespace import, as Valibot recommends: `import * as param from '@nexoamigos/nexo/panel/params'`, `import * as v from '@nexoamigos/nexo/terminal/validators'` — `param.number(0)`, `v.number()`. Docs and examples always write them so; that's what keeps two `number`s apart.
- **Error messages** start with the module's name, a panel's included: `panel: tabs: …`.
- **Events** are `<owner>:<verb>` — the module (`bridge:swap`) or the panel (`gesture:swipe`), like a custom element's own; `done` marks an end. An event is cancelable only when it fires before something that can be stopped (`bridge:swap`), and that something's after is in the past tense (`bridge:swapped`). What the page asks a component to do is the platform's custom command, `<button command="--start" commandfor="…">`, not an event named like an output.
- **Server plug-ins** are what `keep.use()` takes: `Hooks` when they need `onStart` (or only answer some requests: `onRequest`), a `Middleware` when they wrap the response (a stream). Their reserved paths live under `/_nexo/` (`/_nexo/bridge.js`, `/_nexo/terminal`, `/_nexo/witness/reload`).
- **Stopping (`signal`):** anything that can be stopped takes `{ signal }` in an options object, never a bare argument (the platform's way: `fetch`, `addEventListener`). It is required where nothing else would ever end it (listeners, attachments, routers, mounts) and optional where it ends anyway (a request, an animation, a server that has `stop()`).
- **Module-level mutable state** is rare and documented, and is never held across an `await`: concurrent requests must not see each other.

## Functions

- **Short:** 7 lines or fewer is the goal; **10 is the hard limit** (blank lines and comments don't count). `bun run check:size` reports any function over the limit.
- **One level of abstraction:** a function either orchestrates other functions or does one concrete thing, not both.
- **Command–query separation:**
  - A **command** changes state and returns nothing, or `this` so calls can be chained (`router.get(...).get(...)`).
  - A **query** returns a value and changes nothing. Asking a question must not change the answer.

## Errors

- **A wrong value:** code throws (JS options, JSX, a script's call: it shows in development, tests and the editor); markup and CSS report (`reportError`, which reaches `window.onerror` and monitoring) and use the default, so the link or the panel still works (layer 0). A required markup value that is missing is reported and that piece stays off.
- Fail early and loudly: a mistake in how a module is set up throws when it is registered or when the server starts, not on a visitor's request.
- Error messages start with the module name (`boat: …`), say what was wrong and how to fix it.

## Tests

- Tests live next to the code (`router.ts` → `router.test.ts`) and run with `bun test`.
- `*.browser.test.tsx` runs DOM code in real engines through Playwright, inside `bun test`.
- Every bug fix comes with a test that fails without the fix.
- Type-level checks use `// @ts-expect-error` with the reason.

## Style

- TypeScript `strict`. Prettier: 2 spaces, single quotes, no semicolons (`bun run format`).
- Comments explain _why_, not _what_. Public functions and classes have a doc comment with an example.
- Code, comments, docs and commits in English. Commits follow Conventional Commits with the module as scope: `feat(boat): …`, `fix(keep): …`.
