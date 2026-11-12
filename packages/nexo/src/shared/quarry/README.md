# quarry

Raw values shaped for readers in a language: numbers, plurals, lists, dates that are only partly known, sizes, durations and names, built on the platform's `Intl`.

## At a glance

```ts
import { quarry } from '@nexoamigos/nexo/quarry'

const q = quarry('es')
q.number(1234.5) // '1234,5'
q.ordinal(5, { gender: 'feminine' }) // '5.ª'
q.plural(12, { one: '# juego', other: '# juegos' }) // '12 juegos'
q.list(['Capcom', 'Sega', 'Taito']) // 'Capcom, Sega y Taito'
q.partialDate('198') // 'década de 1980'
q.partialDate('1991-05') // 'mayo de 1991'
q.century(1985) // 'siglo XX'
q.bytes(1887436) // '1,9 MB'
q.duration({ minutes: 190 }) // '3 h y 10 min'
q.slug('Tom & Jerry') // 'tom-y-jerry'
```

## Setup

`quarry(tag)` gives the formatter for a language tag (`'es'`, `'es-MX'`, `'es_MX'`). It is built once per language and shared. Its methods are bound, so `const { slug } = quarry('en')` works.

- `quarry(tag)` is strict: a tag that isn't one throws. It is for tags written in your code.
- `quarry.for(tag, fallback = 'en')` never throws: a tag from a visitor (a cookie, a header, a database field) that isn't one gets the fallback language.

quarry works on its own: no router and no translations needed. voices messages use it for their plurals.

## Numbers and words

- `number(value, options)`: `Intl.NumberFormat`'s options pass through.
- `ordinal(n, { gender })`: `'3rd'`, `'3.º'`, `'3.ª'`. Gender matters in Spanish, French, Italian and Portuguese.
- `roman(n)`: 1 to 3999.
- `plural(count, { one, few, many, other })`: picks the form for the count and puts the formatted number where `#` is (`\#` for a literal one). `other` is required.
- `list(items, options)`, `capitalize(text)` by the language's rules.
- `slug(text)`: text for a URL by the language's rules, with its own word for "and" (`'tom-and-jerry'`, `'tom-y-jerry'`) and German `'Größe'` → `'groesse'`.

## Dates and years

- `partialDate(date)` never claims more precision than the data has: `1991-05-22` is a full date, `1991-05` a month, `1991` a year, `198` a decade and `19` a century. A time after the day is ignored, so the day stays the one written.
- `date(moment, options)` is for an exact moment, read in the reader's time zone by default.
- `relative(moment)`: `'hace 2 horas'`, `'ayer'`, `'en 3 años'`. Elapsed time under a day, calendar days from there on.
- `decade(year, { short })`, `century(year)`, `yearRange(from, to)` (as the language writes ranges), `ago(year)`.
- Dates are written in the Gregorian calendar, as the data is. `{ calendar: 'persian' }` asks for the language's own and accepts that its months don't line up exactly. Years follow ISO 8601: year 0 exists.

## Sizes, durations and names

- `bytes(n)`: `'1,9 MB'` in 1000s; `{ binary: true }` gives `'1,8 MiB'` in 1024s.
- `duration({ minutes: 190 })`: say the unit you have; it is split and rounded to the smallest one given. `{ units: 1 }` limits how many show. Days are the largest unit, since months and years have no fixed length.
- `month(9)`, `weekday(7)` (ISO: 1 is Monday), `months()`, `weekdays()` from the day the language's week starts on.
- `language('es')`, `region('JP')`, `currency('MXN')`, `script('Latn')`, `calendar('gregory')`, `field('month')`: the name in this language, `''` when there is none.

## Why it works this way

- **`Intl` first.** Every language `Intl` knows works, with no data files to ship. quarry only adds what `Intl` lacks: ordinal words, decades and centuries, partial dates, slugs, sizes. Languages without their own words fall back to English's for those few.
- **Never inventing precision.** A record that says `198` is "the 1980s", not January 1st, 1980. Museum and archive data is often only partly known, and the page should say exactly what is known.
- **Strict for your code, forgiving for visitors.** A wrong tag in your code is a mistake you want to see. A wrong tag from a request must still give a page, so it has its own entry, `quarry.for`.
- **Usable alone.** quarry imports no other module, so a single-language site, or one that never translates, can still use it.
