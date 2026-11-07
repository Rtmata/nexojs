# panel library

Built-in panels (D.4): industry patterns (WAI-ARIA APG, Open UI). Each one enhances the native element where there is one and works without JS. Register them like your own:

```ts
import {
  attach,
  dialog,
  feed,
  focusgroup,
  registry,
  tabs,
} from '@nexoamigos/nexo/panel'

const panels = registry({ dialog, feed, focusgroup, tabs })
arrivals((segment, { signal }) => attach(segment, panels, { signal }))
```

Gap bridges fill in what an engine lacks today and are marked for removal when support lands.

## focusgroup

Arrow keys among a group's items, one tab stop, memory on re-entry: the standard `focusgroup` attribute (Open UI, Chrome 150).

```html
<div data-panel="focusgroup" focusgroup="toolbar inline wrap">…</div>
```

Words: a behavior (`toolbar`, `tablist`, `radiogroup`, `listbox`, `menu`, `menubar`, which gives the container its minimum role), `inline` or `block` (the arrows' axis, both by default), `wrap` / `nowrap` (`tablist` and `radiogroup` wrap by default), `nomemory`. `focusgroupstart` marks the first item focused on entry; `focusgroup="none"` on a nested element opts it out. **Bridge:** no engine can be feature-checked for it, so the panel handles the keys everywhere and marks them handled. Delete it once every engine ships the attribute; the markup stays.

## tabs

Without JS, links to sections in order, a table of contents (GOV.UK's pattern). With JS, APG tabs: one panel shown, arrows among the tabs, the first one from the URL's `#hash`.

```html
<div data-panel="tabs" data-tabs-activation="manual">
  <ul>
    <li><a href="#games">Games</a></li>
    <li><a href="#screens">Screens</a></li>
  </ul>
  <section id="games">…</section>
  <section id="screens">…</section>
</div>
```

`activation`: `automatic` (the default; a panel shows when its tab gets focus) or `manual` (Enter, Space or a click).

## dialog

On the native `<dialog>`. It already traps focus, closes on Escape and returns focus; `commandfor` opens it with no JS.

```html
<button commandfor="info" command="show-modal">Info</button>
<dialog id="info" data-panel="dialog" closedby="any">
  <h2>Ys</h2>
  …
</dialog>
```

The panel names the dialog from its first heading (APG). **Bridges**, each feature-checked: `command` / `commandfor` (missing in WebKitGTK 2.50) and `closedby` (`any`: a click on the backdrop closes it; `none`: Escape doesn't; missing in Safari 27.2 and WebKitGTK 2.52).

## feed

APG Feed: the museum's infinite shelf. Loading more is bridge's job (`data-bridge-src`, `data-bridge-load="viewport"`, `data-bridge-swap="append"`; it sets `aria-busy` while loading). The panel adds the roles, numbers articles as they arrive (`aria-posinset`, `aria-setsize` from `data-feed-total`, else `-1`) and the keys: Page Down / Up between articles, Ctrl+End / Ctrl+Home out of the feed.

## Lazy media: markup, no panel

`<img loading="lazy">` and `<iframe loading="lazy">` work in every engine. For `<video>`, `loading="lazy"` is Chrome-only (150+). Write `preload="none"` too: every engine then waits to fetch the video, though the `poster` still loads early where `loading` is missing. A script can't help here, because the poster is requested before any script runs.
