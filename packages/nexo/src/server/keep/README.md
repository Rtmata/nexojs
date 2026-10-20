# keep

The server. It takes a router, answers requests with it, serves files from folders, and keeps every answer safe by default.

```ts
import { keep } from '@nexoamigos/nexo/keep'
import { boat } from '@nexoamigos/nexo/boat'

const router = boat().get('/', () => new Response('hello'))
await keep({ router, static: './public' }).listen(3000)
```

## Options

| Option        | Default   | What it does                                                                                                                 |
| ------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `router`      | required  | A `boat()` router, anything meeting `KeepRouter`, or a plain `(request) => Response` function.                               |
| `static`      | none      | Folders served when no route matches: `'./public'`, `{ dir, at, cache, watch }`, or a list of both. Routes always win.       |
| `idleTimeout` | `120`     | Seconds a silent connection stays open (0: forever). A stream sending heartbeats more often than this stays open.            |
| `hedge`       | on        | Requests that change something must come from this site. `false` turns it off; `{ trusted, except, strict }` tunes it.       |
| `bunker`      | on        | The headers every response carries. `false` turns them off; an object tunes each one or adds a Content Security Policy.      |
| `echo`        | always on | A request sent twice with the same `Idempotency-Key` is answered once. `{ ttl, store }` tunes how long and where it is kept. |

## The server

| Member                | What it does                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `use(middleware)`     | Wraps every request. A `Middleware` is `(handler) => handler`; `{ onStart, onRequest, onResponse }` hooks work too. |
| `fetch(request)`      | Answers one request without a network: tests.                                                                       |
| `listen(port = 3000)` | Runs the `onStart` hooks, checks the folders, then listens. `0` picks a free port: read it from `url`.              |
| `url`                 | Where it listens, once it does; `null` before and after.                                                            |
| `stop({ grace })`     | No new requests; the ones running get `grace` ms (5000) to finish, then their connections are closed.               |

A middleware wraps the whole flow; the first one added is the outermost. The order keep itself uses: `bunker` (every answer gets its headers, even a refusal), `hedge`, `echo`, then yours, then the request flow.

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

| `cache`       | `Cache-Control`                       | For                                                           |
| ------------- | ------------------------------------- | ------------------------------------------------------------- |
| unset         | `no-cache`                            | Files that change on deploy: the browser asks, a 304 answers. |
| `'immutable'` | `public, max-age=31536000, immutable` | Files named by their content: the browser never asks again.   |
| a number      | `public, max-age=<seconds>`           | Files that may be a little old.                               |
| `false`       | none                                  | The browser guesses from the date.                            |

While listening, the files of each folder are known from memory and the folder is watched for changes. Watching costs the system one inotify watch per file in Bun (Linux allows 65,536 by default): a folder with tens of thousands of files that never change while the server runs sets `watch: false` — indexed once, a miss still asks the disk.

The same files on a route of your own: `router.get('/covers/*', files('./data/covers', { cache: 'immutable' }))`.

## hedge — requests that change something must come from here

One question for every request that is not GET, HEAD or OPTIONS, answered by the first proof that can speak: the browser's `Sec-Fetch-Site`, then its `Origin`, then a token this site issued. A request from outside gets a 403 before any handler runs.

| Knob      | What it does                                                                            |
| --------- | --------------------------------------------------------------------------------------- |
| `trusted` | Origins whose requests count as this site's: `['https://admin.museo.mx']`.              |
| `except`  | Paths never judged: as written, or a prefix ending in `/` (`'/api/'`).                  |
| `strict`  | A request nobody can vouch for is refused. By default it passes (curl, tests, servers). |

The token: every request gets one in `ctx.hedge.token`; a browser without it is given it in a cookie (`__Host-hedge` over HTTPS and on localhost, `hedge` elsewhere). A form puts it in a hidden field, a `fetch` in a header:

```tsx
;<input type="hidden" name="_hedge" value={ctx.hedge.token} />
// or
fetch('/order', { method: 'POST', headers: { hedge: token } })
```

Only `strict` mode needs the token; with the browser's headers it is never asked for.

## bunker — the headers every response carries

On by default: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: SAMEORIGIN`, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`, `X-Permitted-Cross-Domain-Policies: none`, `X-DNS-Prefetch-Control: off`, `X-XSS-Protection: 0`, and over HTTPS `Strict-Transport-Security: max-age=15552000; includeSubDomains`. Each is a knob (`frameOptions`, `resourcePolicy`, `strictTransportSecurity`…) taking its own value or `false`. A header a handler set itself stays.

A Content Security Policy is written as it is sent, with `'nonce'` standing for the nonce keep mints per request:

```ts
keep({
  router,
  bunker: {
    csp: {
      'default-src': ["'self'"],
      'script-src': ["'self'", 'nonce', "'inline-speculation-rules'"],
    },
    reportOnly: true, // Content-Security-Policy-Report-Only while you try it
  },
})
// in a page:
<script nonce={ctx.bunker.nonce}>…</script>
```

`'inline-speculation-rules'` lets bridge's prefetch rules through. An unknown directive name throws at setup.

## echo — a request sent twice is answered once

A client that may have to send a request again (bridge, when no response came back) puts the same `Idempotency-Key` on every try. keep records the first answer under the key and plays it again (`Idempotent-Replayed: true`) for the rest; the same key with another request is refused (422), and while the first is still being answered so is a second (409). Server errors (5xx) and answers over 1 MB are not recorded: a retry runs again. Requests without the header pass as they are.

```ts
keep({ router, echo: { ttl: 86400, store: myRedisStore } }) // seconds; any { get, set, delete }
```

## In production

keep sends bytes as they are: no gzip, no brotli. Put a reverse proxy in front (Caddy compresses by default; nginx with `gzip on`); it also terminates TLS. Behind it, keep sees plain HTTP: hedge's cookie then goes without `__Host-` and HSTS is not sent — a "behind a proxy" option is a later item.
