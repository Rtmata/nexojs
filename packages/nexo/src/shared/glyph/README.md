# glyph

Styles for Nexo: tokens, themes, recipes and fonts, written in TypeScript and emitted as plain CSS you can read and override. Nothing applies until a `styles` list names it.

## At a glance

```tsx
import { Component } from '@nexoamigos/nexo/omino'
import {
  defineTokens,
  defineTheme,
  recipe,
  reset,
} from '@nexoamigos/nexo/glyph'

const tokens = defineTokens({
  color: {
    surface: '#fff',
    text: '#222',
    primary: '#1d4ed8',
    'on-primary': '#fff',
  },
  space: { s: '0.5rem', m: '1rem' },
})

const night = defineTheme(tokens, 'night', {
  colorScheme: 'dark',
  color: { surface: '#111', text: '#eee' },
})

const button = recipe('button', {
  vars: {
    bg: tokens.color.surface,
    fg: tokens.color.text,
    pad: tokens.space.m,
  },
  base: (v) => ({ background: v.bg, color: v.fg, padding: v.pad }),
  variants: {
    intent: {
      primary: { bg: tokens.color.primary, fg: tokens.color['on-primary'] },
      quiet: {},
    },
    size: { small: { pad: tokens.space.s }, medium: {} },
  },
  defaultVariants: { intent: 'primary', size: 'medium' },
})

class Buy extends Component {
  static styles = [reset, tokens, night, button]
  template() {
    return <button class={button({ size: 'small' })}>Buy</button>
  }
}
// <button class="button button--intent-primary button--size-small">Buy</button>
// <section data-theme="night">…</section> shows the same page in the night theme
```

## Setup

Every piece has its own import path, so you load only what you use: `@nexoamigos/nexo/glyph/recipe`, `@nexoamigos/nexo/glyph/define-tokens`, … The index `@nexoamigos/nexo/glyph` lists them all. What needs a document (`adoptTheme`, `loadFont`, `measureFont`, `checkRecipes`) lives in `@nexoamigos/nexo/glyph/client`.

A sheet reaches the page through an omino component's `styles` list. omino puts each sheet in the page once, however many components list it. Without omino, a sheet is a plain `{ name, css }`: write its `css` into a `<style>` yourself.

## Tokens

```ts
const tokens = defineTokens({
  color: { primary: '#1d4ed8', text: { light: '#222', dark: '#eee' } },
  space: { m: '1rem' },
})
tokens.color.primary // 'var(--color-primary)'
tokens.css // :root { color-scheme: light dark; --color-primary: #1d4ed8; … }
```

- One rule names every custom property: `--<group>-<name>`.
- The known groups and their types are `color`, `space`, `size`, `radius`, `font`, `weight`, `shadow`, `duration` (milliseconds, as numbers), `easing` and `z`. Any other group says its type: `brand: typed('color', { … })`.
- A token may point to another: `primary: palette.blue[700]` writes `--color-primary: var(--blue-700)`. When the other token lives in another token object (a palette), name it: `defineTokens({ … }, { refersTo: [palette] })`.
- A colour may be `{ light, dark }`: it becomes `light-dark()`, following the page's `color-scheme`.
- `contrastChecks: [['on-primary', 'primary', 'text']]` checks WCAG 2.2 contrast now and in every theme: `text` needs 4.5:1, `ui` 3:1. A pair names a token of `color` (`text`) or of another colour group (`brand.ink`). A pair that falls short throws, naming it and by how much.
- `colorMix(a, b, percent)` gives what the browser's `color-mix(in oklch, …)` shows, as a value. `readableOn(background, candidates)` picks the candidate with the best contrast.

## Themes

```ts
const night = defineTheme(tokens, 'night', {
  colorScheme: 'dark',
  color: { surface: '#111' },
})
const dusk = defineTheme(tokens, 'dusk', {
  from: night,
  color: { surface: '#223' },
})
```

- A theme applies to any element with `data-theme="<name>"`, and themes nest. It writes only what changes, but its CSS carries every value, so it looks the same wherever it sits. It also sets `color` and `background-color` from `color.text` and `color.surface`, so a nested room shows its own text.
- `colorScheme` is `'light'`, `'dark'`, or `'inherit'` (take the scheme of the room around it). Without it, the theme follows the system.
- `from` builds on another theme of the same tokens: its values, scheme and contrast pairs.
- Any text names a theme (`'modo noche'`).
- **Themes a person writes:** `themeFrom(tokens, json)` checks a JSON value and gives `{ ok: true, theme }` or `{ ok: false, errors }`. Each error carries `path` (`'color.surface'`), `code` (`'notAColor'`), `data` and an English `message`, so an app can mark the field and say it in its own language. Values are read by each type's grammar, so only what is a colour, a length, a shadow… passes; `var(--token)` of the same type is allowed.
- `adoptTheme(theme, { signal })` puts such a theme on the page while the signal lives.
- `resolve(theme, { colorScheme: 'dark' })` gives the final values, with references followed and the side picked, for what the page's CSS doesn't reach: an iframe, a canvas, an email. `.css({ selector })` writes them under `:root` or any selector, such as `:host`.

## Recipes

```ts
button() // 'button button--intent-primary button--size-medium'
button({ intent: 'quiet' }) // 'button button--intent-quiet button--size-medium'
```

- `vars` are the recipe's own custom properties with their defaults (`--button-bg`). `base` and each part read them as `v.bg`.
- **A variant only changes vars.** It never writes properties, so it wins over the base without fighting specificity.
- Nest CSS's own selectors anywhere: `'&:hover': { … }`, `'@media (width > 60rem)': { … }`.
- `when: [{ intent: 'quiet', size: 'small', set: { pad: '0' } }]` changes vars when several values meet.
- `parts: { icon: (v) => ({ … }) }` makes the call return `{ root, icon }`, each part reading the root's vars by inheritance.
- TS checks every var, group and value. A typo is an error before it runs.
- In development, `checkRecipes({ signal })` from `glyph/client` warns once for a recipe that is used but listed in no `styles` list.

## Fonts

```ts
const fonts = defineFonts({
  body: {
    family: 'Inter',
    files: [{ src: '/fonts/inter.woff2', weight: '100 900' }],
    fallback: 'sans-serif',
    metrics: { local: 'Arial', sizeAdjust: 1.07, ascent: 0.9, descent: 0.22 },
  },
})
const tokens = defineTokens({ font: { body: fonts.body.stack } }) // '"Inter", "Inter fallback", sans-serif'
```

- `fonts` is the sheet of `@font-face` rules. With `metrics`, it adds a fallback face from a font on the device, sized to match, so the page doesn't move when the font arrives.
- `preloadFont(fonts.body)` gives the `<link rel="preload">` HTML for the head (in omino: `raw(…)`).
- `measureFont(fonts.body)` (development, in the browser) prints the `metrics` line to copy.
- `loadFont({ family, files: [{ src }] }, { signal })` loads a font a person brings (a URL or its bytes) and gives its `@font-face` text for an iframe.

## Reset, base and the cascade

- `reset` is a small reset. `base(tokens)` styles text, links, forms and tables from your tokens, with no classes. Both are optional.
- glyph's CSS lives in layers, written once at the top of every sheet: `glyph.reset, glyph.base, glyph.tokens, glyph.themes, glyph.recipes`. **Your own CSS, outside any layer, always wins**, whatever its specificity.

## DTCG

`writeDtcg(palette, tokens)` gives `{ tokens, resolver? }` as DTCG 2025.10 JSON, for Figma, Style Dictionary and other tools; `{ light, dark }` colours also go into a resolver. `readDtcg(json)` reads such a file back into tokens. What one side can't express (`1em`, `steps()`, `$extends`, a gradient) is an error that names it.

## Why it works this way

- **Plain CSS you can read.** Classes are sentences (`button button--size-small`), variables follow one rule (`--color-primary`, `--button-bg`), and nothing is hashed. Anyone can override from a stylesheet without JS. Utility classes in markup, and recipes that make one generated class per variant, were set aside: the first needs a scanner and a large vocabulary, the second fights specificity.
- **Variants change variables, not properties** (daisyUI's mechanism). A variant can't lose to the base, and each component's look stays in one recipe you build yourself. glyph ships no components of its own.
- **Layers, with yours outside.** Overrides never depend on load order or `!important`.
- **Nothing happens on import.** A sheet reaches the page only where a `styles` list names it, so where every rule comes from is visible. Registering CSS on import, or scanning code at build time, would hide that.
- **Light and dark are `light-dark()` + `color-scheme`, not two themes.** Each colour is written once, and native controls follow.
- **Contrast is checked from explicit pairs.** No naming convention guesses which colours meet. Mistakes in code throw; mistakes in a person's JSON come back as errors to show.
- **One source for each name.** A font's family goes into a token through `stack`, and themes are built on the same tokens object, so names can't drift apart.
