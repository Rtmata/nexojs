# Contributing to Nexo

This guide describes how Nexo's code is written. It applies to every module.

## Principles

1. **No magic.** Every behavior can be traced by hand to the line that causes it. No hidden proxies, no import side effects, no code rewriting.
2. **Written to be read.** Nexo's source is part of its documentation: someone who wants to go further than the docs (the "high ceiling") should be able to open any file and follow it like a book. Write for that reader.
3. **Readability and debuggability first.** A long, clear name beats a short, clever one. Code is read and debugged far more often than it is written.
4. **No patches.** When a fix needs a special case, a flag or an extra branch, the design is wrong: restructure instead. Code that is simple to understand is simple to test and simple to fix.
5. **Look like the neighborhood.** New code follows the style of the code around it, even where you would have chosen differently.
6. **Independent modules.** Every module works on its own. Modules connect through plain values visible at the call site (lists, functions, `Request`/`Response`), never by requiring each other. Shared internals that aren't public live in `src/shared/<topic>/` (e.g. `url/decode.ts`, `lang/tag.ts`).
7. **Explicit runtime boundaries.** Code that only runs on the server lives in `src/server/`; code that runs anywhere in `src/shared/`. Bun-specific code lives only in `src/server/dock/`.

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
- **Performance-critical modules** (motion, graphics): hot paths may use data-oriented design — compact data plus systems that walk it, in the spirit of Unity's DOTS — decided per module when it arrives.

## Structure

- **Public API:** one entry function per module, named after it (`boat()`, `keep()`, `quarry()`, `voices()`), or classes when users extend them (`Component`). Public imports are per module (`@nexoamigos/nexo/boat`).
- **Inside a module:** small classes, each with one responsibility, composed by the module's entry function. A class that needs two sentences to describe does two things: split it.
- **Composition by default.** Inheritance only for a real "is a" relationship (a component is a `Component`).

## Functions

- **Short:** 7 lines or fewer is the goal; **10 is the hard limit** (blank lines and comments don't count). `bun run check:size` reports any function over the limit.
- **One level of abstraction:** a function either orchestrates other functions or does one concrete thing, not both.
- **Command–query separation:**
  - A **command** changes state and returns nothing, or `this` so calls can be chained (`router.get(...).get(...)`).
  - A **query** returns a value and changes nothing. Asking a question must not change the answer.

## Errors

- Fail early and loudly: a mistake in how a module is set up throws when it is registered or when the server starts, not on a visitor's request.
- Error messages start with the module name (`boat: …`), say what was wrong and how to fix it.

## Tests

- Tests live next to the code (`router.ts` → `router.test.ts`) and run with `bun test`.
- Every bug fix comes with a test that fails without the fix.
- Type-level checks use `// @ts-expect-error` with the reason.

## Style

- TypeScript `strict`. Prettier: 2 spaces, single quotes, no semicolons (`bun run format`).
- Comments explain _why_, not _what_. Public functions and classes have a doc comment with an example.
- Code, comments, docs and commits in English. Commits follow Conventional Commits with the module as scope: `feat(boat): …`, `fix(keep): …`.
