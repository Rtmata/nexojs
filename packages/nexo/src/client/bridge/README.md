# bridge

Navigation in the browser, segment by segment. The server renders whole pages as always; bridge fetches the next one and swaps in only the segments that changed, so the page stays — its scroll, its state, its playing video. Without JavaScript everything still works: links are links, forms are forms.

## At a glance

```tsx
// server
const router = boat().get('/shelf/:n', (ctx) =>
  render(
    <html>
      <head>
        <script type="module" src="/_nexo/bridge.js" />
      </head>
      <body>
        <h1>Arcade</h1>
        <Segment name="shelf">
          <a href={`/shelf/${Number(ctx.params.n) + 1}`}>next</a>
        </Segment>
      </body>
    </html>,
    { only: segmentsOf(ctx.url) },
  ),
)
keep({ router }).use(bridge())
```

```text
GET /shelf/1                 → the whole page, as without bridge
GET /shelf/2?_segment=shelf  → <div data-bridge-segment="shelf"><a href="/shelf/3">next</a></div>
```

A click on "next" asks for the second URL and replaces only the shelf; the heading, the scroll and anything playing stay. Without JavaScript the same link loads the whole page.

## Setup

```ts
// server
import { bridge, segmentsOf } from '@nexoamigos/nexo/bridge'
import { render, Segment } from '@nexoamigos/nexo/omino'

keep({ router }).use(bridge())                                  // serves /_nexo/bridge.js
router.get('/shelf/:n', (ctx) => render(<Shelf />, { only: segmentsOf(ctx.url) }))
```

```tsx
// page
<script type="module" src="/_nexo/bridge.js" data-bridge-track />
<Segment name="shelf">…links and forms…</Segment>
```

**Start bridge once per page, in one script.** A page with no script of its own loads the served `/_nexo/bridge.js`, which starts bridge for the page's life. A page that uses bridge from its own code (`visit`, `arrivals`) does one of two things:

- an import map that sends `@nexoamigos/nexo/bridge/client` to `/_nexo/bridge.js`, so the served script and your code are one module and one bridge;
- or a bundled client entry that calls `start({ signal })` itself, and no served script.

Importing `bridge/client` starts nothing. While bridge runs, `<html>` carries `data-bridge-started`, so a second `start` from any script throws. `visit`, `reload`, `prefetch` and `arrivals` in a script where bridge isn't started throw, saying how to start it.

```ts
// a bundled client entry
import { arrivals, start } from '@nexoamigos/nexo/bridge/client'

start({ signal: new AbortController().signal })
arrivals((segment, { signal }) => attach(segment, panels, { signal }))
```

A `<Segment name="shelf">` is a region of the page that can be replaced on its own (`data-bridge-segment="shelf"` in the HTML). A link or form inside one is fetched with `?_segment=shelf` — a plain URL you can paste or `curl` — and `render`'s `only` answers with those segments alone. Names may not start with `_`.

## Attributes

Every attribute is inherited: its own value, else the closest ancestor's. `data-bridge-target="_top"` on `<html>` turns the whole site into full-page swaps; `_none` on a section leaves its links to the browser.

| Attribute                    | Values                                                | What it does                                                                                                                     |
| ---------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `data-bridge-segment`        | a name                                                | A region that can be replaced on its own (`<Segment>` writes it).                                                                |
| `data-bridge-target`         | names (`"shelf, counter"`), `_top`, `_none`           | What a link or form replaces. Unset: the segment it sits in; outside every segment, the browser.                                 |
| `data-bridge-twin`           | —                                                     | On a segment: refreshed by every response that carries it (a counter).                                                           |
| `data-bridge-history`        | `push`, `replace`, `none`                             | Record the URL. A whole page pushes by default; segments record nothing; `none` records nothing.                                 |
| `data-bridge-scroll`         | `top`, `keep`, `target`                               | After the swap. A whole page starts at the top; a segment keeps the scroll. A `#hash` in the link wins.                          |
| `data-bridge-swap`           | `replace`, `append`, `prepend`                        | The new content in place of the segment, or inside it after or before the old (infinite lists).                                  |
| `data-bridge-focus`          | `auto`, `keep`, `autofocus`, `target`, `none`, a name | Where the focus goes. `auto`: the hash's element, else kept by id, else `autofocus`, else the new segment if the old one had it. |
| `data-bridge-transition`     | bare, types (`zoom slide`), `false`                   | Snapshots: wrap the swap in a View Transition with these types (and the direction). `false` keeps the change live.               |
| `data-bridge-fail`           | a name, `_none`                                       | The segment that shows error responses instead of the target; `_none`: none, whatever an ancestor says.                          |
| `data-bridge-busy`           | a name, `_none`                                       | Another segment marked `aria-busy` while loading: a global indicator; `_none`: none.                                             |
| `data-bridge-src`            | a URL                                                 | On a segment: fills itself from there, when `data-bridge-load` says.                                                             |
| `data-bridge-load`           | `viewport`, `eager`                                   | A link followed, or a segment filled, when it comes into view or at once.                                                        |
| `data-bridge-prefetch`       | `tap`, `hover`, `viewport`, `eager`                   | The page brought ahead of the click. Links left to the browser get Speculation Rules instead.                                    |
| `data-bridge-prefetch-delay` | milliseconds                                          | How long a hover waits (80). `0` brings at once.                                                                                 |
| `data-bridge-retry`          | `false`                                               | A POST that got no response is NOT sent again (by default it is, once, under its `Idempotency-Key`).                             |
| `data-bridge-hex`            | a URL                                                 | A marker on a long page: the topmost visible one gives the address bar its URL.                                                  |
| `data-bridge-track`          | —                                                     | On a head asset: when it changed between deploys, the page comes the browser's way, not swapped.                                 |

While a request runs, its targets carry `aria-busy="true"` and the link or form `data-active`.

## What the page hears

DOM events that bubble, so `document.addEventListener` hears them all. `bridge:fetch`, `bridge:swap` and `bridge:fail` fire on the link or form; `bridge:swapped` on each segment that just arrived; `bridge:cancel` on a request a later one took over.

| Event            | `detail`                                                            | `preventDefault()`                                      |
| ---------------- | ------------------------------------------------------------------- | ------------------------------------------------------- |
| `bridge:fetch`   | `url`, `method`, `targets`                                          | Nothing happens; the handler owns it.                   |
| `bridge:swap`    | `page`, `url`, `status`, `targets`, `swap()`                        | The swap is handed over: call `detail.swap()` yourself. |
| `bridge:swapped` | `url`, `name`, `signal` (the segment's lifetime)                    | —                                                       |
| `bridge:leave`   | `waitUntil(promise)`: exits to wait for before the segment goes     | —                                                       |
| `bridge:fail`    | `url`, `method`, `error`; `page`, `status` once there is a response | The page is left as it is.                              |
| `bridge:cancel`  | —                                                                   | —                                                       |

Swapped content never runs scripts: client code lives in modules that listen for `bridge:swapped`.

## Segment lifetimes

Every segment has a lifetime, an `AbortSignal`, nested as segments are: an outer segment replaced ends the inner ones. Before a segment goes, `bridge:leave` fires on it and what its listeners hand `detail.waitUntil()` is awaited (at most 4 s); then its signal aborts, then it's replaced. `arrivals` runs code for every segment on the page now, innermost first and the page root last, and for each one that arrives later, so a module that starts late misses nothing:

```js
import { arrivals } from '@nexoamigos/nexo/bridge/client'

arrivals((segment, { signal }) => attach(segment, registry, { signal }))
```

An element with `data-bridge-persist` and an `id` is carried over when the incoming content has its twin: the element itself, with its state and its own lifetime. Component styles a segment response brings (`<style data-scope-for>`) go into the head, once.

## From a script

The script the page loads exports the same thing links do, with the attributes' own words:

```ts
import { visit, reload, prefetch } from '/_nexo/bridge.js'

await visit('/es/arcade/anio/1985', {
  target: 'shelves',
  history: 'push',
  scroll: 'target',
})
await reload('counter') // this page again, that segment
await prefetch('/es/arcade', { target: '_top' })
```

`visit` resolves once the content is in and rejects when bridge stopped (a cancelled event, a later request) or left the page to the browser. Without `target`, a visit is the whole page; with `from: element`, it behaves like a link placed there. What you leave out is read from the markup around `from` (the body by default), as a link there would read it, so site-wide attributes on `<html>` count; `null` says none on purpose (`history: null` records nothing, `fail: null` shows errors in the target), whatever the markup says. An import map lets the page write the package name TypeScript knows:

```html
<script type="importmap">
  { "imports": { "@nexoamigos/nexo/bridge/client": "/_nexo/bridge.js" } }
</script>
```

## Caching, history, fallbacks

- **One cache** of fetched pages, keyed by URL and segments, read by prefetch, twins and back/forward. Fresh for the response's `max-age` (60 s when unsaid; `no-cache` is stale at once); errors and `no-store` are never kept. Going back, a stale page is shown at once and asked again with its `ETag` behind. Any POST drops the whole cache.
- **Back and forward** swap the segments again; every entry remembers its scroll. A `#hash` jump the browser made is adopted.
- **No response to a GET**: the browser loads the URL itself. **No response to a POST**: sent once more under the same `Idempotency-Key` (keep answers it once), then `bridge:fail` and the form stays. **A response without the segment**: an error page stays in context (its `<main>` into the target); a successful one lands as the whole page.
- **A form whose answer redirects to another site** (a payment, a sign-in handoff) is the browser's: mark it `data-bridge-target="_none"`.
- **Under a Content Security Policy**, `script-src` needs `'inline-speculation-rules'` for the prefetch rules bridge writes inline.

## Changes of view

bridge is a view manager: the current view leaves, the next one enters. While it happens — from before the leave until the entry ends — `<html>` carries `data-bridge-direction` (`forward`, `back`, `replace`) and `data-bridge-types`, so CSS can choose in every browser, the exit included.

- **Live** (the default): the leaving segment gets `data-exiting` (and `inert`, focus moved out) and its CSS animations are awaited before the swap; the new one has `data-entering` until its animations end — omino's rule. Endless animations (a busy spinner, a pulsing badge) are not awaited: they are no exit or entry. A navigation cancelled during its leave puts the segment back as it was, its focus and its own `inert` included.
- **Snapshots** (`data-bridge-transition`, on a link, a segment, or the `<html>` of the page that arrives): the swap runs inside `document.startViewTransition`, with the direction and the types as View Transition types where the browser has them (`:active-view-transition-type(back)`).

```css
@keyframes out {
  to {
    opacity: 0;
  }
}
[data-exiting] {
  animation: out 200ms;
}
html[data-bridge-direction='back'] [data-entering] {
  animation: from-left 300ms;
}
```

`bridge:transition` fires before the change with `{ transition, types, direction, from, to }` — `transition` is the `ViewTransition` with snapshots (it fires as that starts), `null` when live (it fires before the leave; if the navigation is then cancelled during the leave, `bridge:cancel` follows on the trigger and the `<html>` marks go). theater gives it a curve and the page's speed without bridge importing it:

```js
document.addEventListener('bridge:transition', (event) => {
  if (event.detail.transition)
    animateView(event.detail.transition, { spring: { duration: 500 } })
})
```

## Why it works this way

- **The server renders whole pages; the browser swaps parts of them.** Every URL answers with a real page, so links, forms, `curl` and search engines work with no JavaScript at all, and bridge is a layer you add, never a requirement. A client that renders the page itself (hydration) was set aside: it needs the same code twice and a page that is blank until the JS runs.
- **Started where you write it, once.** Importing bridge starts nothing; the served script or your entry calls `start`. Starting on import put a second copy of bridge on a page that both loaded the script and bundled an import, and every click was followed twice, with two caches and two histories; segments' lives kept by one copy were ended by the other. The `<html data-bridge-started>` mark makes that mistake an error you see.
- **A segment is named in the HTML, not chosen with a selector.** `data-bridge-segment="shelf"` and `data-bridge-target="shelf"` say what changes in words a reader can follow, and the same names travel in the URL (`?_segment=shelf`) so the server can answer with just those parts. Any server works: without `only`, bridge cuts the segment out of the whole page.
- **One rule for every attribute: inherited from the closest ancestor.** Set `_top` on `<html>` and the site swaps whole pages; set `_none` on a section and its links stay the browser's. No second mechanism for site-wide settings.
- **bridge injects no CSS, no progress bar and no script into what it swaps.** It marks the state (`aria-busy`, `data-active`, `data-exiting`, `data-bridge-direction`) and your CSS shows it. Client code lives in modules that listen for `bridge:swapped` or use `arrivals`, so nothing runs from swapped HTML.
- **Every step is an event you can take over.** `bridge:fetch`, `bridge:swap` and the rest can be cancelled or handled, so a case bridge doesn't cover goes back to the platform instead of needing a new option.
- **Changes of view are live by default.** The leaving content gets a mark and its CSS animation is awaited in every browser, Firefox included. View Transitions are opt-in, because they snapshot the page and freeze what was moving.
- **A form is sent again only when keep can answer it once.** The `Idempotency-Key` lets keep replay the first answer, so a lost response never means a double order.
