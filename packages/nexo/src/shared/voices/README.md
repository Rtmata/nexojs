# voices

The interface's words in every language: plain values and functions you write, checked at startup so every language says everything.

## At a glance

```ts
import { quarry } from '@nexoamigos/nexo/quarry'
import { voices } from '@nexoamigos/nexo/voices'

const en = quarry('en')
const es = quarry('es')

const t = voices(['en', 'es'], {
  en: {
    consoles: 'Consoles',
    games: (n: number) => en.plural(n, { one: '# game', other: '# games' }),
  },
  es: {
    consoles: 'Consolas',
    games: (n: number) => es.plural(n, { one: '# juego', other: '# juegos' }),
  },
})

t('es').consoles // 'Consolas'
t('es').games(12) // '12 juegos'
t.for('es-MX') // { messages: …es, lang: 'es', fallback: false }
t.for('fr') // { messages: …en, lang: 'en', fallback: true }
```

If one language lacks a message, `voices()` throws at startup and lists every gap:

```
voices: the languages don't match. Give every language the same messages:
  "es" is missing "b"
```

## Setup

`voices(languages, messages)` takes a plain list of language tags; the first one is the default. With boat, pass its list: `voices(router.languages, …)`. voices works with any router, or none.

## Messages

- A message is a value or a function. A function takes whatever it needs (`games(12)`) and may use quarry for plurals, numbers and dates. There is no message syntax to learn.
- Messages nest: `t('es').menu.home`. Lists are checked item by item (`tips.1`, `menu.0.label`), so every language has the same items.
- The check runs once, at `voices()`. What it checked is a frozen copy: the objects you passed stay untouched, and nothing can swap a message later. A getter is refused: write a changing message as a function.
- Each tag must be a real language tag (`'es'`, `'es-MX'`, `'pt-BR'`), and two tags that mean the same language (`'en'`, `'EN'`) can't both be there.

## Choosing the language

- `t(lang)` takes the declared languages (TS checks them) and falls back to the default. A request never fails over its language.
- `t.for(tag)` takes any text, such as a cookie, a query value or a database field, and says which language it found: the one asked for, else the closest (`'es-MX'` → `'es'`), else the default. It never throws for a visitor's tag.
- `t.languages` is the list given to `voices()`.

## Texts from elsewhere

`voices(['en', 'es'])` with no messages is enough to pick the version of texts that come from a database or a CMS:

```ts
t.pick({ en: 'Fighter / Versus' }, 'es')
// { value: 'Fighter / Versus', lang: 'en', fallback: true }
```

It returns the version asked for (or its closest, never across scripts), else the first available in the list's order, else any; `null` when there are none. `null`, `undefined` and `''` count as missing. Only keys that are language tags count, so a whole database row (`{ id: 5, en: …, es: … }`) never answers with its `5`. `fallback` lets the page tell the visitor.

## Why it works this way

- **Messages are TypeScript, not a message format.** Plurals, numbers and dates come from quarry functions you call, so TS checks every argument and nothing is parsed at runtime. An ICU-style format can be added later as a layer, if translators outside the code ever need one.
- **Checked at startup, not when a page shows the gap.** A missing message is found before the first request, with the full list of what's missing.
- **The language list is a plain array.** voices doesn't import the router, so it works on its own; boat simply hands it its list.
- **A visitor's tag never breaks a page.** Tags from outside go through `t.for()` and fall back; only the tags in your code are strict.
