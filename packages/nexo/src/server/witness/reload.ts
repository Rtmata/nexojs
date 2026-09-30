import type { Middleware } from '../keep'

/** The URL the page listens on. Prefixed so it never clashes with a real route. */
export const RELOAD_PATH = '/__witness/reload'

/**
 * Reload the browser whenever the server restarts. Development only: add it
 * from your dev entry file, never from the production one.
 *
 *   server.use(reload())
 *
 * How it works, with no hidden parts:
 *   1. Every HTML response gets a small <script> before </body>.
 *   2. That script opens an EventSource (SSE) to RELOAD_PATH, which sends
 *      a `hello` event with an id that is unique to this server process.
 *   3. `bun --watch` restarts the server when a file changes; the connection
 *      drops and EventSource reconnects on its own.
 *   4. The new process says hello with a different id → the page reloads.
 */
export function reload(): Middleware {
  const boot = crypto.randomUUID()

  return (handler) => async (ctx) => {
    if (ctx.url.pathname === RELOAD_PATH) return events(boot)

    const response = await handler(ctx)
    const type = response.headers.get('content-type') ?? ''
    if (!type.startsWith('text/html')) return response

    const html = await response.text()
    const headers = new Headers(response.headers)
    headers.delete('content-length')
    return new Response(inject(html), {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  }
}

/** The SSE stream: one hello, then a heartbeat so idle timeouts don't cut it. */
function events(boot: string): Response {
  let heartbeat: ReturnType<typeof setInterval>
  const encoder = new TextEncoder()

  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(`retry: 250\nevent: hello\ndata: ${boot}\n\n`),
      )
      heartbeat = setInterval(
        () => controller.enqueue(encoder.encode(': ping\n\n')),
        5000,
      )
    },
    cancel() {
      clearInterval(heartbeat)
    },
  })

  return new Response(body, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
    },
  })
}

const SCRIPT = `<script>
(() => {
  // Injected by witness reload() — development only.
  let boot
  new EventSource('${RELOAD_PATH}').addEventListener('hello', (event) => {
    if (boot && boot !== event.data) location.reload()
    boot = event.data
  })
})()
</script>`

/** Put the script right before </body>, or at the end if there is none. */
export function inject(html: string): string {
  const index = html.lastIndexOf('</body>')
  return index === -1
    ? html + SCRIPT
    : html.slice(0, index) + SCRIPT + html.slice(index)
}
