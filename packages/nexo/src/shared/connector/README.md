# connector

State that tells who read it. A `signal` holds a value, a `computed` works one out from others, an effect runs again when what it read changes. Writes only mark; values are worked out when read (push-pull: lazy, cached, glitch-free). It knows nothing of the DOM or the server, and runs in both.

## At a glance

```ts
import { computed, effect, signal, watch } from '@nexoamigos/nexo/connector'

const price = signal(10)
const quantity = signal(2)
const total = computed(() => price.get() * quantity.get())

effect(() => console.log(total.get())) // 20
quantity.set(3) // 30, after the current code

const controller = new AbortController() // a screen's lifetime
watch(
  quantity,
  (now, before, { signal }) => fetch(`/stock?want=${now}`, { signal }),
  {
    signal: controller.signal,
  },
)
controller.abort() // the watch and its fetch end together
```

## Setup

```ts
import { signal } from '@nexoamigos/nexo/connector'
// or one piece: '@nexoamigos/nexo/connector/signal'
```

A reactive read always looks like a call: `.get()`. Reading without depending on it: `peek()`, or `untrack(fn)` for several reads. connector runs on the server and in the browser; nothing in it needs a DOM except `frame` and `MediaQuery` (`idle` falls back to `later(1)`).

## Values

| Piece                        | What it is                                                                                                           |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `signal(value, options?)`    | A value. `set(v)`, `update(fn)` (reads with `peek`, adds no dependency), `get()`, `peek()`, `asReadonly()`.          |
| `computed(fn, options?)`     | A value worked out from others, only when read and only if they changed. An error is its result too, until a change. |
| `asReadonly()`               | The same node without `set`, for a class to expose: `#page = signal(1); readonly page = this.#page.asReadonly()`.    |
| `Readable<T>`, `Writable<T>` | Anything with `.get()` / with `.get()` and `.set()`: what `watch`, `bind:` and the renderer accept.                  |

Options: `equals` (when a new value counts as the same, `Object.is` by default) and `name`, shown in errors and by `sources()`.

A signal notifies if and only if `!equals(old, new)`, so to change an object, replace it: `user.update((u) => ({ ...u, name }))`. Writing a signal while a computed runs is an error.

## Effects

| Piece                          | What it does                                                                                         |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `effect(fn, options?)`         | Runs `fn`, and again when what it read changes. Returns how to end it.                               |
| `watch(sources, fn, options?)` | Runs `fn(now, before, { signal })` when its declared sources change; nothing `fn` reads can wake it. |
| `sources(x)`                   | What a computed or an effect depends on right now.                                                   |
| `batch(fn)`                    | Several writes count as one change.                                                                  |
| `flush()`                      | Run what's pending now, instead of when its scheduler would.                                         |

```ts
const stop = effect(({ signal }) => {
  window.addEventListener('resize', layout, { signal }) // removed before the next run
  title.textContent = name.get()
})

watch(book, (now, before, { signal }) => load(now, { signal }))
watch([page, mode], ([p, m]) => draw(p, m), { immediate: true })
```

Each run gets its own `signal`, aborted just before the next run and when the effect ends; returning a function is cleanup too. The effect's lifetime is `{ signal }` in the options, so aborting one controller ends a screen's effects, listeners and `fetch`es at once.

Options: `scheduler`, `signal`, `onError`, `name`; `watch` adds `immediate`.

**Errors.** An effect that throws ends that run, not the effect: it goes to `onError` (by default `reportError` in a browser, `console.error` elsewhere, so a server never falls over) and runs again on the next change. A returned promise that rejects goes there too, unless the rejection is that run's own cancellation (`signal.reason`, what `fetch` rejects with).

## When effects run

Every run goes through the effect's scheduler, the first one too. A scheduler is `{ schedule(run): cancel }`: being called is the "this is dirty" notice, and it decides when `run` happens. Write your own freely.

| Scheduler      | When                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------- |
| `microtask`    | The default: after the current code, before the browser paints.                           |
| `sync`         | Right away, as soon as the write's batch ends.                                            |
| `frame`        | On the next animation frame. Needs a browser: it throws where there's none.               |
| `later(ms)`    | After `ms`, everywhere.                                                                   |
| `throttle(ms)` | At most once every `ms`.                                                                  |
| `idle`         | When the browser is idle; `later(1)` where it can't say (WebKit, Bun): see `idle.native`. |
| `manual()`     | When you call `run()`: tests.                                                             |

Effects that keep waking each other within one turn are stopped after 100 passes, with an error that names them. Another limit is another scheduler, for the effects you give it: `microtask.with({ limit: 500 })`. `frame` and `later` have no limit: an effect that writes itself there is an animation.

## Async

```ts
const book = resource(id, (id, { signal }) =>
  fetch(`/books/${id}`, { signal }).then((r) => r.json()),
)
book.value.get() // undefined while loading
book.status.get() // 'loading' → 'ready'
```

A `watch` that loads: when its sources change it calls the loader with the run's `signal`, so the latest load wins and a stale answer is dropped.

| Member                  | What it is                                                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `value`                 | The last result. `undefined` while new sources load (the old one would be false data); kept while reloading. Never throws. |
| `error`                 | The last failure; it also goes to `onError`.                                                                               |
| `status`                | `idle` (a source is `undefined`), `loading`, `reloading`, `ready`, `error`, `local`.                                       |
| `isLoading`, `hasValue` | Computeds over `status` and `value`.                                                                                       |
| `reload()`              | Load again with the same sources.                                                                                          |
| `set(v)`, `update(fn)`  | A value of your own (optimistic): status `local`, the load in flight is dropped.                                           |
| `dispose()`             | Ends it. Its `signal` option does too.                                                                                     |

## Collections

In-place change lives only here. Each is a structure of plain signals — one per key or index someone read, plus one for its shape — and notifies only by writing them. Same API as the native type.

| Piece                   | What depends on what                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------- |
| `SignalArray`           | `at(i)` on that index, `length` on the length, reading methods on every item.         |
| `SignalSet`             | `has(x)` on that value; `size` and iterating on what it holds.                        |
| `SignalMap`             | `get(k)` on that key's value, `has(k)` on that key, `keys()` on which keys there are. |
| `SignalDate`            | A real `Date`; every getter on its time.                                              |
| `SignalURL`             | A real `URL`; every part on its `href`; `searchParams` follows it both ways.          |
| `SignalURLSearchParams` | A real `URLSearchParams`.                                                             |
| `MediaQuery`            | `new MediaQuery('(min-width: 60em)', { signal, fallback })`: a `Readable<boolean>`.   |

To change an item, replace it: `log.set(0, { ...entry, text })`.

## Plain values

Every node has `toJSON()`, so whatever goes through JSON needs nothing: `fetch`, Tauri `invoke`, `localStorage`. `snapshot(x)` is exactly what `JSON.stringify(x)` produces, as objects instead of text, for what skips `toJSON`: `postMessage`, `structuredClone`, IndexedDB.

## Events

State is something that is; an event is something that happens.

```ts
const saved = event<Book>()
saved.on((book) => toast(book.title), { signal })
saved.emit(book)
const next = await saved.next({ signal })

changed(settings.theme, themeChanged) // emits the new theme when it changes
```

| Member                     | What it does                                                                   |
| -------------------------- | ------------------------------------------------------------------------------ |
| `on(fn, { signal, once })` | Listen, with `addEventListener`'s options. Returns how to stop.                |
| `emit(value)`              | A plain function, so it can be passed as is: `<Editor onsave={saved.emit} />`. |
| `next({ signal })`         | The next value as a promise; aborting rejects it.                              |
| `size`, `clear()`          | How many listen; stop them all.                                                |

A listener that throws goes to `onError` and the others still run. A group of events is a plain object: `{ saved, closed }`.

## Waiting for calls to stop

```ts
watch(search, debounce(load, 300, { maxWait: 1000 }))
input.oninput = debounce(save, 500)

const query = debounced(search, 300) // a value that follows `search` once it stops changing
effect(() => list(query.get()))
```

`debounce(fn, ms, { leading, maxWait, signal })` returns the function with `cancel()`, `flush()` and `pending` (a readable signal: "saving…"). `debounced(source, ms)` is that, writing a signal from a `watch`; it hears every change, through computeds too. Debouncing is not a scheduler: a scheduler hears once per dirty effect, so it couldn't restart its wait.

## Why it works this way

- **Push-pull: writes mark, reads compute.** A `set` only marks what depends on it; a computed works out its value when read and caches it. So nothing is computed that nobody reads, and an effect never sees half of a change (no glitches).
- **A reactive read looks like a call, `.get()`.** You can tell from the code what is tracked. `.value` properties, proxies and callable signals were set aside: the first two make a tracked read look like a plain one, the third looks like any function call.
- **Two kinds of effect.** `effect` tracks what it reads, for small things. `watch` names its sources, so what wakes it is written where you can see it; hidden dependencies in effects were the bugs to avoid.
- **One scheduler concept at every height.** When an effect runs is a value you pass (`microtask`, `frame`, `later(ms)`, your own), not a set of special APIs. `batch`, `flush` and the loop limit are defined on it.
- **Lifetimes are `AbortSignal`s.** The same signal ends a screen's effects, listeners, `fetch`es and events, because the platform already uses it for all of them. Each run also gets its own signal, so a load that a newer change made stale is dropped.
- **No deep reactivity.** A signal notifies when its value is a different value (`Object.is` by default). In-place change lives only in `SignalArray`, `SignalSet` and `SignalMap`, which are plain signals inside. Deep proxies would track writes nobody can see in the code.
- **State and events are different things.** A signal is something that is; an `event` is something that happens. `changed()` is the one bridge between them, written where it is used.
