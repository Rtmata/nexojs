# bridge

Navigation in the browser, segment by segment. The server renders whole pages as always; bridge fetches the next one and swaps in only the segments that changed, so the page stays — its scroll, its state, its playing video. Without JavaScript everything still works: links are links, forms are forms.

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

A `<Segment name="shelf">` is a region of the page that can be replaced on its own (`data-bridge-segment="shelf"` in the HTML). A link or form inside one is fetched with `?_segment=shelf` — a plain URL you can paste or `curl` — and `render`'s `only` answers with those segments alone. Names may not start with `_`.

## Attributes

Every attribute is inherited: its own value, else the closest ancestor's. `data-bridge-target="_top"` on `<html>` turns the whole site into full-page swaps; `_none` on a section leaves its links to the browser.

| Attribute                    | Values                                                | What it does                                                                                                                     |
| ---------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `data-bridge-segment`        | a name                                                | A region that can be replaced on its own (`<Segment>` writes it).                                                                |
| `data-bridge-target`         | names (`"shelf, counter"`), `_top`, `_none`           | What a link or form replaces. Unset: the segment it sits in; outside every segment, the browser.                                 |
| `data-bridge-twin`           | —                                                     | On a segment: refreshed by every response that carries it (a counter).                                                           |
| `data-bridge-history`        | `push`, `replace`                                     | Record the URL. A whole page pushes by default; segments record nothing.                                                         |
| `data-bridge-scroll`         | `top`, `keep`, `target`                               | After the swap. A whole page starts at the top; a segment keeps the scroll. A `#hash` in the link wins.                          |
| `data-bridge-swap`           | `replace`, `append`, `prepend`                        | The new content in place of the segment, or inside it after or before the old (infinite lists).                                  |
| `data-bridge-focus`          | `auto`, `keep`, `autofocus`, `target`, `none`, a name | Where the focus goes. `auto`: the hash's element, else kept by id, else `autofocus`, else the new segment if the old one had it. |
| `data-bridge-transition`     | `true`, `false`                                       | Wrap the swap in a view transition.                                                                                              |
| `data-bridge-fail`           | a name                                                | The segment that shows error responses instead of the target.                                                                    |
| `data-bridge-busy`           | a name                                                | Another segment marked `aria-busy` while loading: a global indicator.                                                            |
| `data-bridge-src`            | a URL                                                 | On a segment: fills itself from there, when `data-bridge-load` says.                                                             |
| `data-bridge-load`           | `viewport`, `eager`                                   | A link followed, or a segment filled, when it comes into view or at once.                                                        |
| `data-bridge-prefetch`       | `tap`, `hover`, `viewport`, `eager`                   | The page brought ahead of the click. Links left to the browser get Speculation Rules instead.                                    |
| `data-bridge-prefetch-delay` | milliseconds                                          | How long a hover waits (80). `0` brings at once.                                                                                 |
| `data-bridge-retry`          | `false`                                               | A POST that got no response is NOT sent again (by default it is, once, under its `Idempotency-Key`).                             |
| `data-bridge-hex`            | a URL                                                 | A marker on a long page: the topmost visible one gives the address bar its URL.                                                  |
| `data-bridge-track`          | —                                                     | On a head asset: when it changed between deploys, the page comes the browser's way, not swapped.                                 |

While a request runs, its targets carry `aria-busy="true"` and the link or form `data-bridge-active`.

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

`visit` resolves once the content is in and rejects when bridge stopped (a cancelled event, a later request) or left the page to the browser. Without `target`, a visit is the whole page; with `from: element`, it behaves like a link placed there. An import map lets the page write the package name TypeScript knows:

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
