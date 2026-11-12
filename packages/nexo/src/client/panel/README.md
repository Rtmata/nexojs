# panel

Behaviors for markup that is already on the page: a panel is a plain function of `(el, { signal })` with typed params read from `data-*` attributes, and markup names it with `data-panel`. Imports no other module.

## At a glance

```tsx
import { attach, panel, registry } from '@nexoamigos/nexo/panel'
import * as param from '@nexoamigos/nexo/panel/params'

const gallery = panel({
  params: { start: param.number(0), loop: param.boolean() },
  connect: (el, { start }) => ({ index: start, slides: el.querySelectorAll('li') }),
  events: {
    'click .next': (event, ctx) => show(ctx, ctx.index + 1),
    'click .prev': (event, ctx) => show(ctx, ctx.index - 1),
  },
})

const panels = registry({ gallery })

// Server markup, written by the same schema:
<section {...panels.markup({ gallery: { start: 2 } })}>…</section>
// → <section data-panel="gallery" data-gallery-start="2">…</section>

// In the browser, once for the page and again for each arrival:
attach(document.body, panels, { signal })
```

## Setup

- `@nexoamigos/nexo/panel` holds the core (`panel`, `registry`, `attach`, `observe`) and the built-in panels of the [library](library/README.md). The parsers live in `@nexoamigos/nexo/panel/params`, meant for a namespace import (`import * as param`), so `number` never collides with another module's.
- Nothing connects at import. Call `attach` for the page, and for each part of the page that arrives later. With bridge: `arrivals((segment, { signal }) => attach(segment, panels, { signal }))`.

## panel

`panel({ params, events, connect })` returns a function with the same shape as omino's `ref`, so one panel works on server markup and in JSX:

- **`params`:** a schema of parsers. Each param is read from `data-<panel>-<key>` (`autoPlay` → `data-gallery-auto-play`).
- **`events`:** a map from `'<type> <selector>'` to a handler `(event, ctx, matched)`. One listener per event type sits on the panel's own element and matches the selector from the event's target, so children added later are heard too. A key without a selector (`'keydown'`) listens on the element itself. A key names the event that is listened to, as written. An event that doesn't bubble (`focus`, `toggle`, `mouseenter`…) can be heard on the panel's element itself, but not with a selector, since it never reaches the element from below: such a key throws where the panel is written, saying the fix (`focusin` for `focus`, or a listener in `connect`). A handler that throws is reported, and the next one still runs.
- **`connect(el, params, { signal })`:** free code when it connects. What it returns is `ctx` for the handlers. Everything it adds should end with `signal`.

Three ways to connect it:

- `gallery(el, { signal })` uses the params' defaults.
- `gallery.with({ start: 2 })` passes already-typed values, with no parsing: `ref={gallery.with({ start: 2 })}`.
- `gallery.fromMarkup(el, 'gallery', { signal })` reads `data-gallery-*`. This is what `attach` uses.

## Params

```ts
import * as param from '@nexoamigos/nexo/panel/params'

params: {
  start: param.number(0),
  loop: param.boolean(),               // presence is true; only "false" turns it off
  label: param.string('Gallery'),
  shots: param.json<string[]>([], 'array'),
  mode: param.oneOf(['fade', 'slide'], 'fade'),
}
```

- A missing attribute gives the fallback.
- A wrong one is reported (`panel: gallery.start: expected a number, got "two"`) and the fallback stands, so the panel still works. Markup reports; code throws.
- Params are read once, when the panel connects. For a live value, pass a signal.
- Each parser writes too: `registry(…).markup` uses it to write server markup that reads back the same.

## registry, attach and observe

- `registry({ gallery, tabs })` gives the names markup uses, once. Its `markup({ gallery: { start: 2 } })` (one panel or several: `{ gallery: {…}, tabs: {} }`) returns the attributes as JSX takes them, typed by each panel's schema. `attach` and `observe` take a `registry()`, the one way to name panels for markup.
- `attach(root, registry, { signal })` connects every `data-panel` in `root`, `root` included. `data-panel="gallery tabs"` names several. Each connection gets a child of `signal`. An element already connected to a panel isn't connected again while that connection lives. A panel that throws (the wrong element, a name the registry doesn't have) is reported and skipped: the rest of the page connects.
- `observe(root, registry, { signal })` is opt-in, for DOM that changes outside bridge. It attaches what is added and ends what is removed, after the fact, so removed elements get no exits. bridge's segment lifetimes stay the main path.

## Why it works this way

- **A panel is a function of `(el, { signal })`.** It is the same shape as omino's `ref`, so one behavior serves server markup and JSX. A controller class with targets, values and actions would mean three conventions and a mini-language; a custom element changes the markup and learns of its removal only after the fact, too late for exits.
- **Events are a declarative map, delegated from the panel's element.** It reads at a glance, children added later are heard, and every listener ends with the signal. Binding each match directly misses nodes that arrive later.
- **Params are one `data-*` attribute per key, read by a typed schema.** One definition types the JSX and parses the markup. A single JSON attribute needs quoting and can't report which key was wrong.
- **`attach` is explicit.** You call it for the page and for what arrives, so where each behavior comes from is visible and it connects at once. A document-wide observer connects a microtask late, and detaches only after removal. `observe` exists for the rare page that changes outside bridge, and you start it yourself.
- **Everything ends with the signal.** A panel's listeners end with it, and the built-in panels also take back every attribute and style they wrote, so the markup is the server's again and a segment can be swapped or re-attached without leftovers. Your own `connect` follows the same rule by passing `signal` to what it starts.
