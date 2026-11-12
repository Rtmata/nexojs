# keep

The server. It takes a router, answers requests with it, serves files from folders, and keeps every answer safe by default.

## At a glance

```ts
import { keep } from '@nexoamigos/nexo/keep'
import { boat } from '@nexoamigos/nexo/boat'

const router = boat()
  .get('/', () => new Response('hello'))
  .post('/order', () => new Response('ordered', { status: 201 }))

const server = keep({ router, static: './public' })

await server.fetch(new Request('http://localhost/'))
// 200 "hello", with X-Content-Type-Options: nosniff and the other safe headers
await server.fetch(
  new Request('http://localhost/order', {
    method: 'POST',
    headers: { origin: 'https://elsewhere.example' },
  }),
)
// 403: a request that changes something must come from this site
await server.fetch(new Request('http://localhost/robots.txt'))
// 200, the file from ./public, with an ETag and Cache-Control: no-cache

await server.listen(3000)
```

## Setup

```ts
import { keep } from '@nexoamigos/nexo/keep'
import { boat } from '@nexoamigos/nexo/boat'

const router = boat().get('/', () => new Response('hello'))
await keep({ router, static: './public' }).listen(3000)
```

The router may also be a plain `(request) => Response` function. Every option below has a safe default; only `router` is required.

## Options

| Option            | Default         | What it does                                                                                                                                                                                           |
| ----------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `router`          | required        | A `boat()` router, anything meeting `KeepRouter`, or a plain `(request) => Response` function.                                                                                                         |
| `static`          | none            | Folders served when no route matches: `'./public'`, `{ dir, at, cache, watch }`, or a list of both. Routes always win.                                                                                 |
| `idleTimeout`     | `2 * 60 * 1000` | Milliseconds a silent connection stays open (0: forever; at most 255 s, Bun's limit). A stream sending heartbeats more often stays open.                                                               |
| `csrf`            | on              | Requests that change something must come from this site. `false` turns it off; `{ trusted, except, strict }` tunes it.                                                                                 |
| `securityHeaders` | on              | The headers every response carries. `false` turns them off; an object tunes each one or adds a Content Security Policy.                                                                                |
| `idempotency`     | on              | A request sent twice with the same `Idempotency-Key` is answered once. `false` turns it off (a proxy that already does it); `{ ttl, store }` tunes how long (an hour by default) and where it is kept. |

## The server

| Member                            | What it does                                                                                                                                         |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `use(middleware)`                 | Wraps every request. A `Middleware` is `(handler) => handler`; `{ onStart, onRequest, onResponse }` hooks work too.                                  |
| `fetch(request)`                  | Answers one request without a network: tests.                                                                                                        |
| `listen(port = 3000, { signal })` | Runs the `onStart` hooks, checks the folders, then listens. `0` picks a free port: read it from `url`. Aborting `signal` stops it, as `stop()` does. |
| `url`                             | Where it listens, once it does; `null` before and after.                                                                                             |
| `stop({ grace })`                 | No new requests; the ones running get `grace` ms (5000) to finish, then their connections are closed.                                                |

A middleware wraps the whole flow; the first one added is the outermost. The order keep itself uses: `securityHeaders` (every answer gets its headers, even a refusal), `csrf`, `idempotency`, then yours, then the request flow.

```ts
server.use({
  onRequest: (ctx) =>
    ctx.url.pathname === '/health' ? new Response('ok') : undefined,
  onResponse: (ctx, response) => response,
})
```

## What happens to a request

1. A trailing slash is redirected away (301; 308 for other methods, so a POST stays a POST).
2. The router's most specific route answers. HEAD is answered by the GET route, body dropped.
3. Otherwise, a file from the static folders (GET and HEAD only).
4. Otherwise, 405 when the path exists for other methods.
5. Otherwise, the router's 404.

A `Response` thrown anywhere is the answer; anything else thrown goes to the router's error handler, with the context of the route that failed.

## Static files

```ts
static: [
  './public',
  { dir: './data/media', at: '/media', cache: 'immutable', watch: false },
]
```

Every file comes with a weak `ETag` and `Last-Modified`, answers `304` to `If-None-Match` and `If-Modified-Since`, serves byte ranges (`Range`, with `If-Range`), and never leaves its folder: hidden files, paths with `..` and symlinks pointing out are 404.

| `cache`       | `Cache-Control`                         | For                                                             |
| ------------- | --------------------------------------- | --------------------------------------------------------------- |
| unset         | `no-cache`                              | Files that change on deploy: the browser asks, a 304 answers.   |
| `'immutable'` | `public, max-age=31536000, immutable`   | Files named by their content: the browser never asks again.     |
| ms (a number) | `public, max-age=<seconds, rounded up>` | Files that may be a little old: `24 * 60 * 60 * 1000` is a day. |
| `false`       | none                                    | The browser guesses from the date.                              |

While listening, the files of each folder are known from memory and the folder is watched for changes, at one inotify watch per folder (Bun 1.4; Bun 1.3 took one per file): a miss answers 404 from memory, and the startup report says which files a route shadows. A folder whose files never change while the server runs sets `watch: false`: no index and no watcher at all, every request asks the disk (as Express's serve-static and Caddy's file_server always do), the server starts as fast with 70 files as with 70,000, and the shadow report leaves that folder out.

The same files on a route of your own: `router.get('/covers/*', files('./data/covers', { cache: 'immutable' }))`.

## csrf — requests that change something must come from here

One question for every request that is not GET, HEAD or OPTIONS, answered by the first proof that can speak: the browser's `Sec-Fetch-Site`, then its `Origin`, then a token this site issued. A request from outside gets a 403 before any handler runs.

| Knob      | What it does                                                                            |
| --------- | --------------------------------------------------------------------------------------- |
| `trusted` | Origins whose requests count as this site's: `['https://admin.museo.mx']`.              |
| `except`  | Paths never judged: as written, or a prefix ending in `/` (`'/api/'`).                  |
| `strict`  | A request nobody can vouch for is refused. By default it passes (curl, tests, servers). |

The token: every request gets one in `ctx.csrf.token`; a browser without it is given it in a cookie (`__Host-csrf` over HTTPS and on localhost, `csrf` elsewhere). A form puts it in a hidden field, a `fetch` in a header:

```tsx
;<input type="hidden" name="_csrf" value={ctx.csrf.token} />
// or
fetch('/order', { method: 'POST', headers: { 'x-csrf-token': token } })
```

Only `strict` mode needs the token; with the browser's headers it is never asked for.

## securityHeaders — the headers every response carries

On by default: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: SAMEORIGIN`, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`, `X-Permitted-Cross-Domain-Policies: none`, `X-DNS-Prefetch-Control: off`, `X-XSS-Protection: 0`, and over HTTPS `Strict-Transport-Security: max-age=15552000; includeSubDomains`. Each is a knob (`frameOptions`, `resourcePolicy`, `strictTransportSecurity`…) taking its own value or `false`. A header a handler set itself stays.

A Content Security Policy is written as it is sent, with `'nonce'` standing for the nonce keep mints per request:

```ts
keep({
  router,
  securityHeaders: {
    csp: {
      'default-src': ["'self'"],
      'script-src': ["'self'", 'nonce', "'inline-speculation-rules'"],
    },
    reportOnly: true, // Content-Security-Policy-Report-Only while you try it
  },
})
// in a page:
<script nonce={ctx.nonce}>…</script>
```

`'inline-speculation-rules'` lets bridge's prefetch rules through. An unknown directive name throws at setup.

## idempotency — a request sent twice is answered once

A client that may have to send a request again (bridge, when no response came back) puts the same `Idempotency-Key` on every try. keep records the first answer under the key and plays it again (`Idempotent-Replayed: true`) for the rest; the same key with another request is refused (422), and while the first is still being answered so is a second (409). Server errors (5xx) and answers over 1 MB are not recorded: a retry runs again. Requests without the header pass as they are.

```ts
keep({ router, idempotency: { ttl: 24 * 60 * 60 * 1000, store: myRedisStore } }) // ms, as every Nexo time; any { claim, get, set, delete }
```

A store shared by several servers must make `claim` one atomic step — Redis `SET key value NX PX ttl` — so two tries arriving at once can't both run the request. The memory store is atomic by being synchronous.

## In production

keep sends bytes as they are: no gzip, no brotli. Put a reverse proxy in front (Caddy compresses by default; nginx with `gzip on`); it also terminates TLS. Behind it, keep sees plain HTTP: the csrf cookie then goes without `__Host-` and HSTS is not sent — a "behind a proxy" option is a later item. The csrf check itself still works there: it compares the `Origin`'s host, so `https://site` from the browser matches the `http://site` keep sees.

## Why it works this way

- **Web standards, nothing else.** A handler takes a context and returns a standard `Response`; there are no `c.html()` helpers to learn. Bun sits behind a thin layer (the only one today), and a test is one `server.fetch(request)` with no network.
- **Safe by default, each part a knob.** `csrf`, `securityHeaders` and `idempotency` are on unless you turn them off, as Rails and Django protect forms by default: left to each app, each app has to remember it. Each one does one job: csrf judges requests, securityHeaders dresses responses, idempotency answers retries. They were not merged into one, because judging a request and dressing a response are different jobs.
- **One question for "is this request from here?".** The browser's own `Sec-Fetch-Site` and `Origin` answer it first, and a token only when they can't. One verdict and one 403, instead of a token on every form plus a separate origin check. A request nobody can vouch for (curl, tests) passes unless you ask for `strict`, the way Go 1.25 decides it.
- **No Content Security Policy by default.** A strict default policy breaks inline styles and bridge's prefetch rules on the first page. It is one explicit option, with a nonce minted per request.
- **Routes win over files, and you're told.** A file hidden by a route is reported when the server starts, instead of being served sometimes. Static files are the same `files()` handler you can mount yourself.
- **Compression and TLS belong to the proxy in front.** Caddy or nginx already do them well; keep sends bytes as they are.
