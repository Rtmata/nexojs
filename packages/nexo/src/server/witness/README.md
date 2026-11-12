# witness

Development only: the browser reloads by itself whenever the server restarts.

## At a glance

```ts
// dev.ts — your development entry, never the production one
import { keep } from '@nexoamigos/nexo/keep'
import { witness } from '@nexoamigos/nexo/witness'
import { router } from './router'

const server = keep({ router })
server.use(witness())
await server.listen(3000)
```

```sh
bun --watch dev.ts
```

Every HTML page now ends with a small script, and is sent with `Cache-Control: no-store`:

```text
<script>
(() => {
  // Injected by witness() — development only.
  if (window.__witness) return
  window.__witness = true
  const boot = '87b609d3-…'
  new EventSource('/_nexo/witness/reload').addEventListener('hello', (event) => {
    if (event.data !== boot) location.reload()
  })
})()
</script>
```

Change a file: `bun --watch` restarts the server and the page reloads.

## Setup

Add `witness()` from a development entry file only. Add it before any middleware that reads whole responses: its stream to the page never ends, so a middleware waiting for a full body would wait forever.

## How it works

1. Each server process gets an id when `witness()` is first called.
2. Every HTML page a browser navigates to gets the script at its end. A fragment (a `fetch`, an iframe, a part of a page), a download, a compressed or UTF-16 body, or a response with no body is left as it is. The page streams through untouched, byte for byte; the script follows it, and browsers place a script after `</html>` in the body.
3. The script opens an `EventSource` to `/_nexo/witness/reload`, which answers `hello` with the id of the process answering now, then a ping every 5 seconds so idle timeouts don't cut it.
4. `bun --watch` restarts the server on a change. The connection drops, `EventSource` reconnects on its own, and a different id means the page came from an older process: reload.

`RELOAD_PATH` exports the path, for a test or a proxy rule. Everything Nexo reserves lives under `/_nexo/`, so it never clashes with your routes.

With keep's security headers on, the script carries the request's nonce (`ctx.nonce`), so a nonce-only Content Security Policy lets it run.

## Why it works this way

- **You add it; it is never guessed.** Development tools join from the development entry, so production never carries them, and no environment variable decides it.
- **The server's restart is the signal.** `bun --watch` already restarts on every change, so witness only has to notice a new process. It doesn't watch files or keep a list of what changed.
- **The page is never rewritten.** The script is added after the page as it streams, so what you test is what production sends.
- **A plain `EventSource`.** The browser already reconnects on its own and nothing else is needed: no WebSocket server, no client library.
