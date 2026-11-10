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

A hyphenated name is a registry key: `registry({ 'press-hold': pressHold })`, and its params read `data-press-hold-duration`. A boolean param is on by its presence, and off by the one text `"false"` (`data-x-open="false"`, for a param whose default is on). Every panel event is `<panel>:<verb>`, bubbles, and carries its facts in `detail`. Every panel takes back what it wrote when it ends (its `signal` aborts): the markup is the server's again. A panel that throws (the wrong element, a bad param) is reported as an uncaught error naming it, and the rest of the page's panels still connect.

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

`activation`: `automatic` (the default; a panel shows when its tab gets focus) or `manual` (Enter, Space or a click). The selected tab is the tab stop (APG), so Tab never changes the selection. A link whose `#hash` names no section is an error.

## dialog

On the native `<dialog>`. It already traps focus, closes on Escape and returns focus; `commandfor` opens it with no JS.

```html
<button commandfor="info" command="show-modal">Info</button>
<dialog id="info" data-panel="dialog" closedby="any">
  <h2>Ys</h2>
  …
</dialog>
```

The panel names the dialog from its first heading (APG). The `closedby="any"` bridge closes only on a press that both starts and ends on the backdrop, as the platform does. An alert dialog is the standard `role="alertdialog"` on the same `<dialog>` (R.34): the panel then describes it with its first paragraph (`aria-describedby`), unless you wrote one. **Bridges**, each feature-checked: `command` / `commandfor` (missing in WebKitGTK 2.50) and `closedby` (`any`: a click on the backdrop closes it; `none`: Escape doesn't; missing in Safari 27.2 and WebKitGTK 2.52).

## feed

APG Feed: the museum's infinite shelf. Loading more is bridge's job (`data-bridge-src`, `data-bridge-load="viewport"`, `data-bridge-swap="append"`; it sets `aria-busy` while loading). The panel adds the roles, numbers articles as they arrive (`aria-posinset`, `aria-setsize` from `data-feed-total`, else `-1`) and the keys: Page Down / Up between articles, Ctrl+End / Ctrl+Home out of the feed.

## requestCloseTop

Not a panel: a function for the Android back button or the museum's own Escape. It closes the innermost open modal dialog or popover (a menu in a sheet before the sheet) with the platform's own `requestClose()` / `hidePopover()`, so `cancel` and `beforetoggle` still run. Returns whether it closed something; `false` means the app may go back.

```ts
onBack(() => requestCloseTop() || history.back())
```

## press-hold

A long press: `press-hold:press` with `{ pointerType }` after `duration` ms (400) without moving more than `slop` px (8). Letting go anywhere, inside or outside, before that cancels it (WCAG 2.5.2). The click that follows is swallowed, and so is the context menu of a press that fired. Keyboard twin: the ContextMenu key or Shift+F10.

## confirm-on-hold

For destructive buttons: hold for `duration` ms (800) to fire `confirm-on-hold:confirm`; a plain click does nothing. CSS gets `data-holding` and `--hold-duration` to draw the progress. By keyboard (R.31) hold Space or Enter, or press once to arm (`data-armed`, the `armed` text announced in a live region) and again to confirm; Escape or leaving disarms.

## gesture

Pointer gestures on an element: `gesture:tap`, and `gesture:swipe` with `{ direction, distance, velocity }` past `threshold` px (40) or `velocity` px/s (300). `axis` (`x`, `y`, `both`) sets `touch-action` so the page still scrolls the other way. One pointer at a time, followed on the document and never captured, so buttons and links inside keep their clicks. With `follow`, CSS gets `--gesture-x` / `--gesture-y` while dragging; `data-gesturing` and `data-flung` mark the moments. Give it a keyboard path of your own (buttons): a gesture is never the only way.

## slider

On native `<input type="range">`, alone or several in a container (multi-thumb, APG). CSS gets `--slider-fill` (a percentage, `0%`–`100%`); `data-slider-valuetext="{value} €"` sets `aria-valuetext`. Thumbs never cross: each one's `aria-valuemin` / `aria-valuemax` follow its neighbours (the end thumbs keep the native bounds), and the container gets `--slider-from` / `--slider-to`. A form reset repaints.

## hover-intent

A mouse that stays: `hover-intent:enter` after `enter` ms (250) still, `hover-intent:leave` after `leave` ms (150) away; `data-intent` meanwhile. Touch and pen are ignored; one passing through means nothing.

## keymap

Keys to actions: `data-keymap-keys='{"j":"next","ctrl+k":"search","?":"help"}'` fires `keymap:action` with `{ action, key }`. A printed character carries its own Shift (`?`), and `ctrl+shift+k` is a different binding from `ctrl+k`. Typing in a field never triggers it unless Ctrl, Alt or Meta is held.

## indicator

The moving tab underline or blob. On the container, CSS gets `--indicator-x`, `--indicator-y`, `--indicator-width`, `--indicator-height` of the active item (`aria-selected="true"`, `aria-current`, `data-active`, or the `active` selector), relative to the container's padding box with its scrolling included, measured again when the item changes, the container scrolls, or either resizes. The motion is yours:

```css
nav::after {
  translate: var(--indicator-x) 0;
  width: var(--indicator-width);
  transition: 0.2s;
}
```

## tokens

CSS custom properties from markup: `data-tokens-values='{"accent":"#e3b341"}'` sets `--accent`, removed when the panel ends.

## replay

Restarts the element's animations (its subtree's too) each time the `on` event reaches it: `data-replay-on="click"` (required; a server-rendered animation already plays when the page arrives). `replayAnimations(el)` does the same from code.

## activity

Whether the visitor is here: `data-activity` is `active`, `idle` (nothing for `idle` ms, 60 000) or `hidden` (page not visible), and `activity:change` carries `{ state }`. On `<html>` it hears the whole page. Built on events and Page Visibility, not IdleDetector (Chrome-only, asks permission).

## typewriter and decode

Text effects. `typewriter` shows a character (a whole grapheme: an emoji never shows half) every `speed` ms (30); `decode` settles scrambled text left to right over `duration` ms (800), scrambling from `charset`. Both keep the element's own content, links and emphasis included, for assistive technology (moved into a visually hidden span, the animated text `aria-hidden`), put it back when done, show it at once with reduced motion, and end with `typewriter:done` / `decode:done`.

## sequence

Phases one after another, such as a page turn: `data-sequence-phases='["out","step","in"]'`. When the `on` event arrives (`sequence:start`), `data-phase` takes each phase; CSS animates on it, and the next starts when the element's animations finish (at most 4 s). `sequence:phase` carries `{ phase, waitUntil }`: hand `waitUntil` a promise (the next page loading) and the phase waits for it too, 4 s at most. Ends with `sequence:done`; a run in progress stops where it is when the panel ends.

## listbox

APG Listbox over a plain list, for choices that aren't a form's. In a form, write native radios (one choice) or checkboxes (several): they work without JS, send their value, and take rich labels; no panel needed (R.38).

```html
<ul data-panel="listbox" aria-label="Platform">
  <li data-value="snes">SNES</li>
  <li>Mega Drive</li>
  <li aria-disabled="true">Jaguar</li>
</ul>
```

Focus stays on the list (`aria-activedescendant`); style the active option with `[data-active]` and the chosen ones with `[aria-selected=true]`. Items that arrive later (bridge appending) become options too, unless you marked options by hand. One choice: the arrows select. `data-listbox-multiple`: Space toggles, Shift+arrows select on the way, Shift+Space selects from the last toggled one, Ctrl+Shift+Home/End to the ends, Ctrl+A all (again: none). Typeahead in both. `listbox:change` carries `{ value, values }`, from `data-value` or the text. When the panel ends, the list is plain again.

## combobox

APG Combobox (R.39). The element you'd write without Nexo decides what it is:

```html
<!-- free text with suggestions: layer 0 sends what was typed -->
<input
  name="q"
  data-panel="combobox"
  aria-controls="titles"
  aria-label="Search"
/>
<ul id="titles" hidden></ul>

<!-- a filterable select: layer 0 is the select, which sends the option's value -->
<label for="platform">Platform</label>
<select id="platform" name="platform" data-panel="combobox">
  <option value="snes">SNES</option>
  …
</select>
```

On an `<input type="text">`, the list its `aria-controls` names holds the suggestions. Fill it as the visitor types (from your own `input` listener, or a bridge swap) and set `data-combobox-filter="none"`, or leave a fixed list for the panel to filter (`contains`, the default, or `starts`). `type="search"` is refused: ARIA lets it be only a searchbox. On a `<select>`, the panel adds an input and a list made from the options, hides the select and writes every choice back to it, firing its `input` and `change`. A typed text that names no option goes back to the select's own when focus leaves. The select stays the source: a form reset, options added or re-selected, or the app setting `select.value` and firing `change` (as the platform asks) all reach the input. ↓ on a closed list shows every option again, whatever was typed. `aria-autocomplete` picks APG's variant: `none`, `list` (default) or `both` (the rest of the first match written in and selected, taken when focus leaves). Keys: ↓ opens and moves in, Alt+↓ only opens, ↑, Enter takes the active suggestion (with none, the form submits), Escape closes, and when closed it clears free text. Focus stays in the input; style the active suggestion with `[data-active]`. `combobox:change` carries `{ value, text }`.

## menu

APG Menu and Menubar + Menu Button, in Open UI's shape (R.35). Layer 0 is the native popover opened by its invoker; without JS the menus still open and their buttons still work:

```html
<button commandfor="acts" command="toggle-popover">More</button>
<div id="acts" data-panel="menu" popover>
  <button>Favorite</button>
  <button commandfor="formats" command="toggle-popover">Export</button>
  <div id="formats" popover>
    <button data-value="json">JSON</button><button>CSV</button>
  </div>
  <hr />
  <button role="menuitemcheckbox">Subtitles</button>
  <div role="group">
    <button role="menuitemradio" aria-checked="true">Small</button>
    <button role="menuitemradio">Large</button>
  </div>
</div>
```

On a popover it's a menu; on an in-page element (`<div data-panel="menu" aria-label="Main">`), a menubar with one tab stop. Buttons and links become `menuitem`; write `role="menuitemcheckbox"` or `"menuitemradio"` for checkable items (radios group by the nearest `role="group"`); an `<hr>` is a separator. The panel adds `aria-haspopup` / `aria-expanded` to every trigger of a menu (several buttons may open one; focus returns to the one that did) and moves focus into a menu when it opens (the first item; ↑ on the menu button opens on the last). Keys: the arrows of the menu's axis move and wrap, the other axis opens a submenu or goes back to its item, and under a menubar it moves to the bar's next menu. Home / End, typeahead, Enter chooses and closes every menu, Space flips a checkable and keeps the menu open, Escape closes the menu it's in, and Tab leaves and closes them all. `menu:select` carries `{ value, checked }` (`data-value`, else the text). Placing the menus is CSS (anchor positioning). For a context menu, open the same popover from `press-hold:press` or the ContextMenu key. The `command` bridge is shared with `dialog`.

## tooltip

APG Tooltip written as the platform writes it: an interest invoker and a hint popover.

```html
<button interestfor="tip">ⓘ</button>
<div id="tip" popover="hint" data-panel="tooltip">Released in 1987</div>
```

A tooltip nothing points at (no `id`, or no `interestfor` naming it) is an error. Where the engine has interest invokers (Chrome 142+), the panel does nothing. Elsewhere it is a gap bridge that copies the platform:

- interest comes after `data-tooltip-start` ms (500) of hover or focus, stays while the pointer or focus is on the invoker or the tooltip, and is lost `data-tooltip-end` ms (250) after leaving both;
- Escape loses it at once, so does the platform's own light dismiss, and `interest` / `loseinterest` fire on the tooltip;
- a plain-text tooltip describes its invoker (`aria-describedby`); a rich one (links, headings…) gets `role=tooltip`, and its invoker `aria-details` and `aria-expanded`.

The defaults are what Chromium 156 does for `interest-delay: normal`. Place it with CSS anchor positioning. Where the platform lacks interest invokers, a tooltip stays hidden without JS, so never put anything essential only in a tooltip.

## toast

A messages region (R.40) that exists from the first render (a live region added later is often not announced). Its children are the messages, added by the app or by bridge (`data-bridge-swap="append"`). A message the server rendered after a form post is layer 0.

```html
<div
  id="notices"
  data-panel="toast"
  role="log"
  aria-label="Notices"
  data-toast-close="Close"
>
  <p>Saved</p>
</div>
```

```ts
toastRegion()!.insertAdjacentHTML(
  'beforeend',
  '<p>Added to favorites <button>Undo</button></p>',
)
```

- **Staying:** messages stay until closed (WCAG 2.2.1), and each one gets a close button (`[data-toast-dismiss]`, named by `data-toast-close`). With `data-toast-duration="5000"`, a message without controls of its own leaves by itself, paused while hovered or focused and while the window isn't (Radix). A message with an Undo always waits for the visitor.
- **Roles:** `role="log"` is the default, for ordered, polite messages; use a separate `role="alert"` region for urgent ones. The region is a `<div>` or `<section>`, never a list: ARIA in HTML lets no `<ul>`/`<ol>` be a log or an alert.
- **Leaving:** a closing message gets `[data-leaving]` for its exit animation, and focus stays in the region.
- **Reaching it:** F8 (`data-toast-key`) moves focus to the region in use.
- **Modal dialogs:** everything outside an open modal `<dialog>` is inert, so a dialog that sends messages holds its own region. `toastRegion()` returns the one of the top-most modal (the one holding focus: everything under it is inert), else the page's.
- **Placing it:** CSS (`position: fixed; z-index`). Never `display: none` the region.
- **Event:** `toast:dismiss` carries `{ text, reason }` (`close` or `timeout`).

## accordion

APG Accordion on native `<details>` (R.33): the same `name` keeps one section open at a time (Chrome 120, Safari 17.2, Firefox 130), and Enter, Space and Tab are the platform's. Without the panel it already works.

```html
<div id="faq" data-panel="accordion" data-accordion-remember>
  <details name="faq" id="controls">
    <summary>Controls</summary>
    …
  </details>
  <details name="faq" id="credits">
    <summary>Credits</summary>
    …
  </details>
</div>
```

`data-accordion-remember` keeps the open sections for the session (`sessionStorage`, under the panel's `id` or `data-accordion-key`; sections need ids) and restores them on the next visit, as GOV.UK's accordion does. `accordion:toggle` carries `{ id, open }`. For one or two short pieces, a lone `<details>` is enough.

## switch

APG Switch on the platform's own `<input type="checkbox" switch>` (Safari 17.4):

```html
<label><input type="checkbox" switch data-panel="switch" /> Subtitles</label>
```

Gap bridge: where the engine lacks `switch` (Chrome, Firefox, 2026-11) the panel sets `role="switch"`; everything else — Space, `checked`, the form value — is the checkbox's. The look is CSS. Register it as `{ switch: switchControl }` (`switch` is a reserved word).

## grid

APG Grid on a native `<table>`, the table itself being layer 0 (every row shown):

```html
<table data-panel="grid" aria-label="Series">
  <thead>
    <tr>
      <th>Title</th>
      <th>Year</th>
    </tr>
  </thead>
  <tbody>
    <tr id="ys" aria-level="1">
      <td>Ys</td>
      <td>1987</td>
    </tr>
    <tr id="ys2" aria-level="2">
      <td>Ys II</td>
      <td>1988</td>
    </tr>
  </tbody>
</table>
```

One tab stop, and APG's keys: the arrows move between cells and stop at the edges (a data grid never wraps), Home / End within the row, Ctrl+Home / End across the grid, Page Up / Down by `data-grid-page` rows (5). A cell with one simple widget (a link, a button, a checkbox) focuses the widget itself, and Enter there is the widget's own; a cell with several, or with a field that takes the arrows (a text input, a select), takes Enter or F2 to go in (Tab moves among them) and Escape, or leaving the cell, to come out. Header cells become `columnheader` (in `<thead>` or `scope="col"`) or `rowheader`.

**Treegrid (R.36):** rows with `aria-level` make the table a `treegrid`. A row followed by deeper rows is a parent: it gets `aria-expanded` (closed unless you wrote `aria-expanded="true"`), its children hide while it's closed, and it takes focus as a row: → opens it (or enters its first cell), ← closes it (or, from the first cell, goes back to the row), ↑ ↓ Home End move between rows. `grid:toggle` carries `{ id, expanded }`. Not built (APG "if supported"): selection, `aria-rowcount` for virtual rows, sorting.

## tree

APG Tree View on plain nested lists (R.36). Without JS it's an outline with everything shown; nested `<details>` without a panel remain the right markup for an outline that must fold without JS (that's nested disclosures, not a tree: ARIA lets `<details>` carry no role).

```html
<ul data-panel="tree" aria-label="Contents">
  <li>
    Part I
    <ul>
      <li><a href="#c1">Chapter 1</a></li>
      <li aria-expanded="true">
        Chapter 2
        <ul>
          <li>Section 1</li>
        </ul>
      </li>
    </ul>
  </li>
</ul>
```

As APG's examples, the treeitem is the `<li>`, or the link that starts it (the `<li>` is then `none`); a list inside an item is its `group`. Parents get `aria-expanded` (closed unless you wrote `true`) and their groups hide while closed. One tab stop (the `aria-current` item, else the selected one, else the first). Keys: ↑ ↓ between visible items, → opens a parent or enters it, ← closes it or goes up, Home / End, `*` opens every sibling, typeahead. Enter on a link follows it; on another item Enter, Space or a click selects it (`aria-selected`, one at a time), and a click on a parent's own text toggles it. `tree:toggle` carries `{ id, expanded }`, `tree:select` `{ id, value }` (`data-value`, else the text). Not built: multiple selection, `aria-level` / `aria-setsize` for lazily loaded nodes.

## carousel

APG Carousel on a scroll-snap scroller. Layer 0 is native scrolling (touch, wheel, scrollbar) with CSS `scroll-snap-type`; the slides are the scroller's children.

```html
<section
  data-panel="carousel"
  aria-label="Screens"
  data-carousel-interval="5000"
>
  <button data-carousel-toggle></button>
  <button data-carousel-prev aria-label="Previous">‹</button>
  <ul data-carousel-slides>
    <li><img … /></li>
    <li aria-label="Title screen"><img … /></li>
  </ul>
  <button data-carousel-next aria-label="Next">›</button>
</section>
```

The panel names the parts as APG asks (`aria-roledescription` carousel / slide; "N of M" only for a slide without a name of its own), wires the buttons you wrote (they never take focus away, so they can be repeated), keeps `data-current` on the visible slide and scrolls instantly under `prefers-reduced-motion`. Rotation, with `data-carousel-interval` (ms): it stops while the carousel is hovered or focused and only the toggle restarts it; the toggle's label says what it will do (`data-carousel-play` / `-pause`), and the slides are `aria-live="off"` while rotating, `polite` once stopped. Without an interval the toggle hides. Put the toggle first in the tab order (APG). A slide picker is the `tabs` panel over the same slides, not built in. `carousel:change` carries `{ index }`.

## splitter

APG Window Splitter: a separator that resizes the pane its `aria-controls` names. Layer 0: the panes keep the sizes your CSS gave them.

```html
<div class="shell">
  <nav id="side">…</nav>
  <div
    data-panel="splitter"
    aria-controls="side"
    aria-label="Sidebar width"
  ></div>
  <main>…</main>
</div>
```

```css
.shell {
  display: flex;
}
#side {
  inline-size: var(--splitter-size, 16rem);
}
```

The panel writes `--splitter-size` (px) on the container and keeps `aria-valuenow` as the pane's share of it (0–100). Drag it, or: ← → (↑ ↓ with `data-splitter-orientation="horizontal"`, panes stacked) by `data-splitter-step` px (10; ×10 with Shift), Home / End to `data-splitter-min` / `-max` (px; max defaults to the container), Enter collapses the pane (`data-collapsed`) and restores it. `splitter:resize` carries `{ size, value }`.

## reveal, parallax, drag, pinch (theater's pieces as markup)

The markup layer over theater (A.1): each wraps the piece of the same name, with its fallback, reduced motion and signal.

```html
<!-- data-in-view while it is in view: CSS animates its arrival -->
<section data-panel="reveal" data-reveal-amount="0.3">…</section>

<!-- lags the scroll; nothing under reduced motion -->
<div data-panel="parallax" data-parallax-depth="0.3">…</div>

<!-- follows the pointer, flings with inertia, rests on a 220 px grid -->
<ul
  data-panel="drag"
  data-drag-axis="x"
  data-drag-min="-4000"
  data-drag-max="0"
  data-drag-snap="220"
>
  …
</ul>

<!-- two fingers or a trackpad zoom it, 1× to 4× -->
<div data-panel="pinch" data-pinch-max="4" data-pinch-pan>…</div>
```

```css
[data-in-view] {
  animation: rise 0.4s both;
}
@media (prefers-reduced-motion: reduce) {
  [data-in-view] {
    animation-name: fade-in;
  }
}
```

Dragging and pinching need a way without them (WCAG 2.5.7): give buttons, or use theater's `drag(…).set()` / `pinch(…).set()` from JS.

## Native already: markup and docs, no panel (R.33)

These APG patterns are the platform's own; write the element and style it.

| Pattern                                           | Write                                                                                                | Notes                                                                        |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Checkbox, mixed state                             | `<input type="checkbox">`, `indeterminate` from script                                               | `bind:indeterminate` in omino                                                |
| Radio group                                       | `<fieldset><legend>` + `<input type="radio" name>`                                                   | One tab stop and arrows are native. Prefer it over a listbox in forms (R.38) |
| Spinbutton                                        | `<input type="number" min max step>`                                                                 |                                                                              |
| Date picker                                       | `<input type="date">` (`month`, `time`, `datetime-local`)                                            | Open UI's datepicker has no native element yet (2026-11)                     |
| Alert                                             | `<div role="alert">`, present from the first render                                                  | For messages that keep arriving, `toast` with `role="alert"`                 |
| Toolbar                                           | `<div role="toolbar" data-panel="focusgroup" focusgroup="toolbar inline">`                           |                                                                              |
| Disclosure                                        | `<details>` / `<summary>`                                                                            | Several with one `name` = `accordion`                                        |
| Switch                                            | `<input type="checkbox" switch>` + `switch` panel where the attribute is missing                     |                                                                              |
| Select, select-only combobox                      | `<select>`; `appearance: base-select` to style it (Chrome 135, Safari 27; a plain select elsewhere)  | A filterable one: `combobox` on the `<select>`                               |
| Navigation bar                                    | `<nav>` + `<a aria-current="page">`; `indicator` for the moving mark                                 |                                                                              |
| Button, link, table, meter, landmarks, breadcrumb | `<button>`, `<a href>`, `<table>`, `<meter>`, landmark elements, `<nav aria-label="Breadcrumb"><ol>` | Static APG patterns                                                          |

## Lazy media: markup, no panel

`<img loading="lazy">` and `<iframe loading="lazy">` work in every engine. For `<video>`, `loading="lazy"` is Chrome-only (150+). Write `preload="none"` too: every engine then waits to fetch the video, though the `poster` still loads early where `loading` is missing. A script can't help here, because the poster is requested before any script runs.
