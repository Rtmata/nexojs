# boat

The router. On the server it finds the handler for each request and builds links to named routes, in as many languages as the site has. In the browser, the same route patterns pick the page without a trip to the server.

## At a glance

```ts
import { boat, notFound, route } from '@nexoamigos/nexo/boat'
import { keep } from '@nexoamigos/nexo/keep'

const games = new Map([['pong', { title: 'Pong' }]])
export const gameRoute = route('game', {
  en: '/en/games/:id',
  es: '/es/juegos/:id',
})

const router = boat({ languages: ['en', 'es'] })
  .get('/', () => new Response('home'))
  .get(gameRoute, {
    load: ({ params }) => games.get(params.id) ?? notFound(),
    page: (game, { params, lang, link }) =>
      new Response(
        `${game.title} · ${link(gameRoute, { id: params.id }, lang === 'en' ? 'es' : 'en')}`,
      ),
  })
  .redirect('/games/:id', gameRoute)
  .notFound(
    ({ url }) => new Response(`No ${url.pathname} here`, { status: 404 }),
  )

await keep({ router }).listen(3000)
```

| Request           | Answer                                                  |
| ----------------- | ------------------------------------------------------- |
| `/en/games/pong`  | 200 `Pong · /es/juegos/pong`                            |
| `/es/juegos/pong` | 200 `Pong · /en/games/pong`                             |
| `/en/games/myst`  | 404 `No /en/games/myst here` (`notFound()` from `load`) |
| `/games/pong`     | 301 to `/en/games/pong`                                 |

`gameRoute.href({ id: 'tetris' }, 'es')` gives `/es/juegos/tetris` anywhere, without the router.

## Setup

The server router is `@nexoamigos/nexo/boat`; the browser one is `@nexoamigos/nexo/boat/client`. keep serves the server router: `keep({ router })`.

## Routes

- `router.get(path, handler)`, and `post`, `put`, `patch`, `delete`. A handler gets a context and returns a standard `Response`: `({ request, url, params, lang, link }) => new Response(…)`. There are no response helpers. Throwing a `Response` ends the request with it too.
- Paths take `:name` params and a trailing `*` wildcard. Params arrive decoded: `/games/:id` gives `params.id`.
- **Registration order never matters.** The most specific route wins (a static segment beats a param, a param beats a wildcard). Two routes that would answer exactly the same URLs throw at once, instead of one silently hiding the other.
- `HEAD` is answered by the `GET` route, and a path that exists for other methods gets 405: both are keep's work, using the router's `match` and `allowed`.
- **A route in two parts:** `{ load, page }`. `load` gets the data; `page` turns it into a `Response`. A `Response` returned or thrown by `load` ends the request there, which is how a loader redirects. `notFound()` from `load` says "the route matched, but what it names isn't there", and the router answers with its `notFound` page.
- `router.notFound(handler)` and `router.onError(handler)` replace the default 404 and 500 answers.

## Names and links

- **Two ways to register, told apart by what you pass, never by its text:** a path (`router.get('/health', handler)`, a route with no name) or a `route()`. A name, or a path per language, always goes in `route()`.
- `route('game', paths)` declares a route on its own, in any file: `router.get(gameRoute, handler)`. Links to it are checked by the editor (a missing param is a type error) and built without the router: `gameRoute.href({ id: 'nes' }, 'es')`. `router.href('game', …)` and `ctx.link('game', …)` build them by name too.
- A redirect goes to a path, a full URL, a `route()` or a function. A route's bare name is refused: pass its `route()`.
- `router.check()` throws if something declared can't work, such as a redirect to a `route()` never registered. keep calls it when the server starts.

## Languages

```ts
const router = boat({
  languages: ['en', 'es'],
  langFrom: ['prefix', { cookie: 'lang' }, 'header'],
})
const consoleRoute = route('console', {
  en: '/en/console/:id',
  es: '/es/consola/:id',
})
router.get(consoleRoute, handler)
```

- A route may have a path per language. Each becomes a normal route, and `ctx.lang` says which answered. A route declared per language needs a path for each language, unless it says `{ only: ['es'] }`.
- `langFrom` says where a request's language comes from: `'prefix'`, `'subdomain'`, `'header'`, `{ cookie }`, `{ query }`, a list tried in order, or your own function. With a subdomain or a cookie, two languages may share a path.
- `ctx.link('console', { id }, 'es')` links in another language; without the language, in the request's own.
- `router.alternates(ctx)` gives the current page's URL in every language it exists in, for a language switcher or `hreflang` links.

## Redirects

```ts
router.redirect('/', '/en')
router.redirect('/consolas/:id', consoleRoute) // 301, the same id
router.redirect('/old/:id', (ctx) => `/new/${lookup(ctx.params.id)}`)
```

A declared redirect is known to the router, so tools can list it or write it out for a static host. Params carry over to the target. For a page that only sometimes redirects, return `redirect(url)` from its `load`.

## In the browser

```tsx
import * as connector from '@nexoamigos/nexo/connector'
import { mount } from '@nexoamigos/nexo/omino/client'
import { boat, navigationUrl, routes } from '@nexoamigos/nexo/boat/client'

const router = boat({
  match: routes({
    '/': { page: () => <h1>Home</h1> },
    '/games/:id': {
      load: ({ params, signal }) =>
        fetch(`/api/games/${params.id}`, { signal }).then((r) => r.json()),
      page: (game) => <h1>{game.title}</h1>,
      failed: ({ retry }) => <button onclick={retry}>Try again</button>,
    },
  }),
  source: navigationUrl(),
  reactivity: connector,
  signal,
})
router.notFound(({ url }) => <p>No {url.pathname} here</p>)

mount(
  <main aria-busy={() => router.data.isLoading.get()}>{router.page}</main>,
  document.body,
  { signal, reactivity: connector },
)
```

- `routes({ … })` uses the server's patterns (params, wildcards, decoding, the most specific wins; two paths for the same URLs throw, as on the server) and returns a plain `match` function. You may pass your own instead.
- A route is `{ load?, page, failed? }`. `load` gets `{ params, url, signal }`; the latest navigation wins and a stale answer is dropped. While it loads, the page before stays and `router.data.isLoading` says so.
- `router.page` is a hole for omino: put it where the page goes.
- `failed` is the page for a `load` that throws, with `{ error, retry }`. A route's own wins over `router.failed(page)`. Without either, the page before stays and the error is reported.
- **Where the URL comes from:** `navigationUrl()` (the Navigation API), `historyUrl()` (`pushState`), `hashUrl()` (`#/games/3`, any scheme, `tauri://` included) or `memoryUrl()` (tests, embedded views).
- Clicks on links the router claims are taken; `router.visit(url)` goes there from a script. A URL no route claims leaves for real, and the server answers it. With `notFound` set, the router claims every URL.
- Scroll is boat's: a new page starts at the top, or at its `#target`; back and forward return to where the visitor was.

## Why it works this way

- **Standard `Request` in, `Response` out.** A handler is a plain function you can call in a test. Helpers like `c.html()` would be a second way to answer, to learn and to keep in step with the platform.
- **The most specific route wins, and clashes are errors.** First-match-in-order routing makes registration order a hidden rule; here a mistake is found when the server starts.
- **Routes in code, as values.** `route()` makes links checkable from any file, and it is the one way to name a route: a text that meant a path when it started with `/` and a name otherwise was set aside, since a typo silently changed its meaning. File-based routing can come later as a layer that calls the same router.
- **"Not found" has two kinds.** No route at all, and a route whose thing doesn't exist. Both reach the same page, but a loader can say the second without faking a missing route.
- **Languages are routes, not a rewrite.** Each language's path is a real route, so links, redirects and `alternates` know about every language with no URL rewriting in between.
- **The browser router imports nothing.** It takes `match`, the URL source and the signals library as values, so it works without omino or connector, and a desktop app picks the hash while a site picks the Navigation API.
