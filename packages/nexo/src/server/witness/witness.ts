import type { Context, Handler } from '../../shared/http/types'

/** The URL the page listens on. Prefixed so it never clashes with a real route. */
export const RELOAD_PATH = '/__witness/reload'

/**
 * Reload the browser whenever the server restarts. Development only: add it
 * from your dev entry file, never from the production one.
 *
 *   server.use(witness())
 *
 * How it works, with no hidden parts:
 *   1. Every HTML page (a document, not a fragment, a download or a part)
 *      gets a small <script> at its end, carrying the id of this process.
 *   2. That script opens an EventSource (SSE) to RELOAD_PATH, which says
 *      `hello` with the id of the process answering now.
 *   3. `bun --watch` restarts the server when a file changes; the connection
 *      drops and EventSource reconnects on its own.
 *   4. A different id means the page came from an older process → reload.
 *
 * The page streams through untouched, byte for byte; the script follows it
 * (browsers place a script after `</html>` in the body). Add witness()
 * first, before middlewares that read whole responses: its stream never
 * ends, so one waiting for the full body would wait forever.
 */
export function witness(): (handler: Handler) => Handler {
  const boot = processId()
  return (handler) => async (ctx) => {
    if (ctx.url.pathname === RELOAD_PATH) return helloStream(boot, ctx.request)
    const response = await answerOf(handler, ctx)
    return isDocument(ctx.request) ? withScript(response, boot) : response
  }
}

let boot: string | undefined

/** One id per server process, made the first time witness() is called. */
function processId(): string {
  return (boot ??= crypto.randomUUID())
}

/**
 * The handler's answer, also when it's thrown. keep treats a thrown
 * Response as the answer too, but only outside every middleware: inside,
 * witness has to catch it to add the script to that page.
 */
async function answerOf(handler: Handler, ctx: Context): Promise<Response> {
  try {
    return await handler(ctx)
  } catch (error) {
    if (error instanceof Response) return error
    throw error
  }
}

/**
 * A page the browser navigates to. Fragments (htmx, fetch) and iframes say
 * otherwise in `Sec-Fetch-Dest`; without the header (plain HTTP on the LAN,
 * tests), it counts as a page, and the script guards against running twice.
 */
function isDocument(request: Request): boolean {
  const destination = request.headers.get('sec-fetch-dest')
  return destination === null || destination === 'document'
}

/** The page with the script after it, never cached: a stored copy would carry an old id. */
function withScript(response: Response, boot: string): Response {
  if (!canRewrite(response)) return response
  const headers = new Headers(response.headers)
  for (const name of STALE_HEADERS) headers.delete(name)
  headers.set('cache-control', 'no-store')
  const body = response.body.pipeThrough(appending(scriptFor(boot)))
  const { status, statusText } = response
  return new Response(body, { status, statusText, headers })
}

/** Headers that describe the old body, wrong once the script is added. */
const STALE_HEADERS = ['content-length', 'etag', 'content-md5']

/** Statuses that never carry a body. */
const NO_BODY = new Set([101, 204, 205, 304])

/**
 * A whole HTML page shown in the browser, uncompressed, in an encoding the
 * ASCII script fits into: not a part (206), a download or UTF-16.
 */
function canRewrite(
  response: Response,
): response is Response & { body: ReadableStream<Uint8Array> } {
  const { headers, status, body } = response
  if (body === null || NO_BODY.has(status) || status === 206) return false
  if (/attachment/i.test(headers.get('content-disposition') ?? '')) return false
  const encoding = headers.get('content-encoding')
  if (encoding && encoding.toLowerCase() !== 'identity') return false
  return isHtml(headers.get('content-type'))
}

/** `text/html` in any case, in any charset but UTF-16 (where ASCII bytes aren't text). */
function isHtml(contentType: string | null): boolean {
  const type = (contentType ?? '').toLowerCase()
  return type.split(';')[0]!.trim() === 'text/html' && !type.includes('utf-16')
}

/** Passes the body through as it streams, then adds `text` at the end. */
function appending(text: string): TransformStream<Uint8Array, Uint8Array> {
  return new TransformStream({
    flush: (controller) => controller.enqueue(new TextEncoder().encode(text)),
  })
}

/**
 * The SSE stream a page listens to: one hello with this process's id, then
 * a heartbeat so idle timeouts don't cut it. The heartbeat stops when the
 * stream is cancelled, when the request goes away, or when sending fails.
 */
function helloStream(boot: string, request: Request): Response {
  let heartbeat: ReturnType<typeof setInterval> | undefined
  const stop = () => clearInterval(heartbeat)
  request.signal.addEventListener('abort', stop)
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      heartbeat = sayHello(controller, boot, stop)
    },
    cancel: stop,
  })
  return new Response(body, { headers: SSE_HEADERS })
}

/** Send the hello now and a ping every 5 s; the timer is returned to stop it. */
function sayHello(
  controller: ReadableStreamDefaultController<Uint8Array>,
  boot: string,
  stop: () => void,
): ReturnType<typeof setInterval> {
  const send = (text: string) => trySend(controller, text, stop)
  send(`retry: 250\nevent: hello\ndata: ${boot}\n\n`)
  return setInterval(() => send(': ping\n\n'), 5000)
}

function trySend(
  controller: ReadableStreamDefaultController<Uint8Array>,
  text: string,
  stop: () => void,
): void {
  try {
    controller.enqueue(new TextEncoder().encode(text))
  } catch {
    stop() // closed without a cancel: nothing to send to
  }
}

const SSE_HEADERS = {
  'content-type': 'text/event-stream',
  'cache-control': 'no-cache',
}

/** The script for a page made by the process `boot`; once per window. */
function scriptFor(boot: string): string {
  return `<script>
(() => {
  // Injected by witness() — development only.
  if (window.__witness) return
  window.__witness = true
  const boot = '${boot}'
  new EventSource('${RELOAD_PATH}').addEventListener('hello', (event) => {
    if (event.data !== boot) location.reload()
  })
})()
</script>`
}
