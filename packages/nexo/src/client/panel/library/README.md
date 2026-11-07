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

A hyphenated name is a registry key: `registry({ 'press-hold': pressHold })`, and its params read `data-press-hold-duration`. Every panel event is `<panel>:<verb>`, bubbles, and carries its facts in `detail`.

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

## requestCloseTop

Not a panel: a function for the Android back button or the museum's own Escape. It closes the innermost open modal dialog or popover (a menu in a sheet before the sheet) with the platform's own `requestClose()` / `hidePopover()`, so `cancel` and `beforetoggle` still run. Returns whether it closed something; `false` means the app may go back.

```ts
onBack(() => requestCloseTop() || history.back())
```

## press-hold

A long press: `press-hold:press` with `{ pointerType }` after `duration` ms (400) without moving more than `slop` px (8). The click that follows is swallowed, and so is the context menu while held. Keyboard twin: the ContextMenu key or Shift+F10.

## confirm-on-hold

For destructive buttons: hold for `duration` ms (800) to fire `confirm-on-hold:confirm`; a plain click does nothing. CSS gets `data-holding` and `--hold-duration` to draw the progress. By keyboard (R.31) hold Space or Enter, or press once to arm (`data-armed`, the `armed` text announced in a live region) and again to confirm; Escape or leaving disarms.

## gesture

Pointer gestures on an element: `gesture:tap`, and `gesture:swipe` with `{ direction, distance, velocity }` past `threshold` px (40) or `velocity` px/s (300). `axis` (`x`, `y`, `both`) sets `touch-action` so the page still scrolls the other way. With `follow`, CSS gets `--gesture-x` / `--gesture-y` while dragging; `data-gesturing` and `data-flung` mark the moments. Give it a keyboard path of your own (buttons): a gesture is never the only way.

## slider

On native `<input type="range">`, alone or several in a container (multi-thumb, APG). CSS gets `--slider-fill` (0–1); `data-slider-valuetext="{value} €"` sets `aria-valuetext`. Thumbs never cross: each one's `aria-valuemin` / `aria-valuemax` follow its neighbours, and the container gets `--slider-from` / `--slider-to`.

## hover-intent

A mouse that stays: `hover-intent:enter` after `enter` ms (250) still, `hover-intent:leave` after `leave` ms (150) away; `data-intent` meanwhile. Touch and pen are ignored; one passing through means nothing.

## keymap

Keys to actions: `data-keymap-keys='{"j":"next","ctrl+k":"search","?":"help"}'` fires `keymap:action` with `{ action, key }`. Typing in a field never triggers it unless Ctrl, Alt or Meta is held.

## indicator

The moving tab underline or blob. On the container, CSS gets `--indicator-x`, `--indicator-y`, `--indicator-width`, `--indicator-height` of the active item (`aria-selected="true"`, `aria-current`, `data-active`, or the `active` selector), measured again when it changes or anything resizes. The motion is yours:

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

Restarts the element's animations (its subtree's too) when the `on` event reaches it: `data-replay-on="click"`. `replayAnimations(el)` does the same from code.

## activity

Whether the visitor is here: `data-activity` is `active`, `idle` (nothing for `idle` ms, 60 000) or `hidden` (page not visible), and `activity:change` carries `{ state }`. On `<html>` it hears the whole page. Built on events and Page Visibility, not IdleDetector (Chrome-only, asks permission).

## typewriter and decode

Text effects. `typewriter` shows a character every `speed` ms (30); `decode` settles scrambled text left to right over `duration` ms (800), scrambling from `charset`. Both keep the whole text for assistive technology (a visually hidden copy, the animated one `aria-hidden`), show it at once with reduced motion, and end with `typewriter:done` / `decode:done`.

## sequence

Phases one after another, such as a page turn: `data-sequence-phases='["out","step","in"]'`. When the `on` event arrives (`sequence:start`), `data-phase` takes each phase; CSS animates on it, and the next starts when the element's animations finish (at most 4 s). `sequence:phase` carries `{ phase, waitUntil }`: hand `waitUntil` a promise (the next page loading) and the phase waits for it too. Ends with `sequence:done`.

## listbox

APG Listbox over a plain list, for choices that aren't a form's. In a form, write native radios (one choice) or checkboxes (several): they work without JS, send their value, and take rich labels; no panel needed (R.38).

```html
<ul data-panel="listbox" aria-label="Platform">
  <li data-value="snes">SNES</li>
  <li>Mega Drive</li>
  <li aria-disabled="true">Jaguar</li>
</ul>
```

Focus stays on the list (`aria-activedescendant`); style the active option with `[data-active]` and the chosen ones with `[aria-selected=true]`. One choice: the arrows select. `data-listbox-multiple`: Space toggles, Shift+arrows select on the way, Shift+Space selects from the last toggled one, Ctrl+Shift+Home/End to the ends, Ctrl+A all (again: none). Typeahead in both. `listbox:change` carries `{ value, values }`, from `data-value` or the text. When the panel ends, the list is plain again.

## Lazy media: markup, no panel

`<img loading="lazy">` and `<iframe loading="lazy">` work in every engine. For `<video>`, `loading="lazy"` is Chrome-only (150+). Write `preload="none"` too: every engine then waits to fetch the video, though the `poster` still loads early where `loading` is missing. A script can't help here, because the poster is requested before any script runs.
