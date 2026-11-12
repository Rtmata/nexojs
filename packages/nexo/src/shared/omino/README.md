# omino

JSX components as classes. The server renders them to HTML; in the browser, the same JSX is built into the DOM, and only the values you mark as changeable ever update.

## At a glance

```tsx
import { Component, For, Slot, css, render } from '@nexoamigos/nexo/omino'

type BadgeProps = { tone?: 'gold' | 'gray' }

class Badge extends Component<BadgeProps> {
  static defaults: Partial<BadgeProps> = { tone: 'gray' }
  static styles = [
    css`
      :scope {
        padding: 0 0.25rem;
        border-radius: 4px;
      }
    `,
  ]
  template() {
    return (
      <span class={['badge', `badge--${this.props.tone}`]}>
        {this.props.children}
      </span>
    )
  }
}

class Shelf extends Component<{
  games: { id: number; title: string; year: number }[]
}> {
  template() {
    return (
      <section>
        <h2>
          <Slot name="title">Games</Slot>
        </h2>
        <ul>
          <For each={this.props.games} key={(game) => game.id}>
            {(game) => (
              <li>
                {game.get().title}{' '}
                <Badge tone={game.get().year < 1980 ? 'gold' : undefined}>
                  {game.get().year}
                </Badge>
              </li>
            )}
          </For>
        </ul>
      </section>
    )
  }
}

router.get('/', () =>
  render(
    <html>
      <head>
        <title>Arcade</title>
      </head>
      <body>
        <Shelf games={games}>
          <span slot="title">Arcade</span>
        </Shelf>
      </body>
    </html>,
  ),
)
```

What comes out (`text/html; charset=utf-8`, the doctype first; indented here, sent on one line):

```html
<html>
  <head>
    <title>Arcade</title>
    <style data-scope-for="Badge">
      @scope ([data-scope="Badge"]) to ([data-scope]) {
        :scope {
          padding: 0 0.25rem;
          border-radius: 4px;
        }
      }
    </style>
  </head>
  <body>
    <section>
      <h2><span>Arcade</span></h2>
      <ul>
        <li>
          Pong <span class="badge badge--gold" data-scope="Badge">1972</span>
        </li>
        <li>
          Tetris <span class="badge badge--gray" data-scope="Badge">1984</span>
        </li>
      </ul>
    </section>
  </body>
</html>
```

## Setup

In the app's `tsconfig.json`:

```json
"jsx": "react-jsx",
"jsxImportSource": "@nexoamigos/nexo/omino"
```

That is the whole transformation: TypeScript and Bun turn `<h1 class="x">` into a call that only records what was written. Every piece has its own import path (`@nexoamigos/nexo/omino/render`, `…/for`, `…/swap`, …). The browser side, `mount`, lives in `@nexoamigos/nexo/omino/client`.

## Components

- A component is a class with `template()`. It returns JSX, and may be `async` to load its own data on the server.
- `static defaults` fills props that weren't passed (a prop passed as `undefined` counts as not passed). A subclass adds to its parent's defaults instead of replacing them. Annotate them as `Partial<Props>`.
- `this.props.children` shows what was written inside the tag. `<Slot name="footer">` shows only the children marked `slot="footer"`, with its own children as the fallback.
- `template(context, { signal })`: `context` is what `render(page, { context })` was given, the same object for every component of the page (declare its fields once with `interface RenderContext`). `signal` is the component's lifetime: pass it to effects, listeners and fetches.
- `mounted({ signal })` runs in the browser only, once the component's nodes are in the document and before paint, children first. Clean up through the signal, or return a function.

## Markup

- Text and attributes are escaped. A URL attribute that would run code (`javascript:`) is refused. `raw(html)` inserts trusted HTML as is: your own Markdown output, JSON-LD, inline SVG. Never use it with anything a visitor typed.
- `class` takes a string, a list, or an object whose truthy keys are kept: `['btn', size && 'btn--small', { 'btn--off': disabled }]`.
- `style` takes an object with CSS's own property names: `{ 'font-size': '2rem', '--accent': gold }`.
- `if={condition}` renders the element only when the condition is truthy.
- Events are HTML's own names, lowercase: `onclick={fn}`, or `onwheel={{ handleEvent, passive: true }}` for listener options. Each is a direct `addEventListener`, with no delegation, removed with the component. `onClick` and `onclick="code"` are errors. On the server, function listeners are left out, so the same JSX renders on both sides.
- `key` is refused everywhere except `<For>`: omino never diffs, so a key would do nothing.

## Rendering on the server

- `render(tree, init?)` returns a `Response`: `<!doctype html>`, the HTML, and an HTML content type unless `init.headers` sets one. `init` is a normal `ResponseInit` (`{ status: 404 }`) plus `context` and `only`.
- `<Segment name="shelf">` marks a region bridge can replace alone (`<div data-bridge-segment="shelf">`; `tag` picks the element). `render(page, { only: ['shelf'] })` answers with just those segments.
- On the server every changeable value is read once.

## In the browser

```tsx
import * as connector from '@nexoamigos/nexo/connector'
import { For } from '@nexoamigos/nexo/omino'
import { mount } from '@nexoamigos/nexo/omino/client'

const controller = new AbortController()
const query = connector.signal('')
const games = connector.signal(['Pong', 'Tetris', 'Myst'])
const shown = () => games.get().filter((g) => g.includes(query.get()))

mount(
  <div>
    <input type="search" bind:value={query} />
    <p if={() => shown().length === 0}>Nothing found</p>
    <ul>
      <For each={shown}>{(game) => <li>{() => game.get()}</li>}</For>
    </ul>
  </div>,
  document.getElementById('app')!,
  { signal: controller.signal, reactivity: connector },
)
```

- `mount(tree, el, { signal, reactivity, context? })` builds the tree into `el`, replacing its content. When it returns the DOM is complete, and `mounted` and `ref` have run. Aborting the signal ends every component and removes what it placed.
- `reactivity` is a signals library passed as a value: connector fits as it is, and another library enters through a small adapter. omino imports none.
- **A hole** is a value that can change: a signal (anything with `.get()`) or a function. `template()` runs once. Each hole is bound to its own place (a text node, an attribute, a property) and only that place updates. On the server it is read once.
- A hole that returns JSX is a **region**: its content is replaced when the hole changes. By default the old content leaves first, then the new one comes. `<Swap order="in-out">` or `order="together"` (for crossfades) changes that.
- `<For each={…} key={…}>` is the keyed list. Each row is made once per key, gets `item` and `index` as signals that change in place, and moves instead of being rebuilt. `move` lets reordered rows slide: `true` leaves it to CSS through `data-moving`, a function takes over (theater's `moves`).
- `bind:value={signal}` binds a control both ways, with each control's own value: text and numbers (empty is `null`), dates, `checked`, `bind:group` for checkbox lists and radios, selects, `files` (read only), `open` on `<details>` and `<dialog>`, contenteditable text, media time and volume, element sizes. Text inputs write on `input`; `bind-on="change"` waits for the change.
- `ref={(el) => …}` gets the element once it is placed. `prop:name={value}` sets a DOM property instead of an attribute.
- **Comings and goings.** Leaving content is marked `data-exiting`, made `inert`, and loses focus. omino then awaits its CSS animations (at most a fallback time) or its own `exit={(el, { signal, reducedMotion }) => promise}`, and only then removes it. New content gets `data-entering` and `enter` the same way; entries don't play on the first mount. `exit-timeout` caps the wait.

## Styles

```tsx
class Card extends Component {
  static styles = [
    tokens,
    button,
    css`
      :scope {
        padding: 1rem;
      }
      h2 {
        margin: 0;
      }
    `,
  ]
}
```

- `styles` is a list. Strings are the component's own CSS, page-wide sheets (glyph's tokens, themes and recipes, or any `{ name, css }`) go next to them.
- The component's own CSS goes once into `<head>` inside `@scope`, from its root (`data-scope="Card"`) to the next styled component's root. It reaches only this component's markup, with no added specificity. `:scope` is the root itself.
- A page-wide sheet goes once per page, as it is.
- `static encapsulation = 'shadow'` puts the template in a shadow root instead (its template returns one element, the host), and `'none'` writes the CSS globally. A shadow component can't list page-wide sheets yet.
- Two different classes with the same name and different CSS are an error: the class name is the scope.

## Why it works this way

- **The server comes first.** A page is HTML from `render()`, and it works before any JS. The browser adds behaviour to what is there; it doesn't rebuild the page.
- **Fine-grained holes, no virtual DOM and no compiler.** `template()` runs once and only the marked places update. Re-running whole components with a virtual DOM wastes that precision, and building templates at compile time needs a compiler the plain JSX transform can't feed. `For` is the only place that reconciles, by key.
- **Reactivity arrives as a value.** omino imports no signals library, so it works alone and any library can drive it.
- **Platform names everywhere.** Events are `onclick`, styles use CSS's own property names, lifetimes are `AbortSignal`s, and a list's moves use `moveBefore` where the browser has it. Anything learned here is learned for the web.
- **`@scope` for styles, without rewriting selectors.** Native scoping keeps your CSS as written. Rewriting it per component needs a CSS parser; Shadow DOM repeats the CSS per instance and blocks global styles.
- **Exits are awaited, never skipped.** Leaving content stays until its animation ends, but can't be clicked or focused meanwhile. Reduced motion is passed to you rather than decided for you.
