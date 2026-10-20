import { fileURLToPath } from 'node:url'
import { CLIENT_PATH } from '../../shared/bridge/vocabulary'
import type { Context } from '../../shared/http/types'
import { bundleForBrowser } from '../dock/bun'

export { CLIENT_PATH }

/**
 * Client-side navigation by segments. The server part is small: it serves
 * the browser script at CLIENT_PATH and nothing else.
 *
 *   server.use(bridge())
 *
 * The page loads it itself — nothing is injected:
 *
 *   <script type="module" src="/_nexo/bridge.js"></script>
 *
 * The script is bundled from its TypeScript source as soon as `bridge()`
 * is called, and `listen()` waits for it through `onStart`, so a broken
 * client stops the server from starting. Then it is kept with an ETag, so
 * browsers revalidate for free.
 *
 * Under a Content Security Policy (keep's `bunker`), the script itself is
 * `'self'`; the Speculation Rules it writes for `data-bridge-prefetch` on
 * links left to the browser are an inline script, which needs
 * `'inline-speculation-rules'` in `script-src` — without it the browser
 * ignores them, and only those: bridge's own prefetch is unaffected.
 *
 *   keep({ router, bunker: { csp: { 'script-src': ["'self'", "'inline-speculation-rules'"] } } })
 */
export function bridge(): BridgeHooks {
  const script = new ClientScript(CLIENT_ENTRY)
  return {
    onStart: () => script.ready(),
    onRequest: (ctx) =>
      ctx.url.pathname === CLIENT_PATH ? script.answer(ctx.request) : undefined,
  }
}

/** What `bridge()` gives `server.use()`: the shape keep's hooks have, without needing keep. */
export interface BridgeHooks {
  onStart: () => Promise<void>
  onRequest: (ctx: Context) => Promise<Response> | undefined
}

const CLIENT_ENTRY = fileURLToPath(
  new URL('../../client/bridge/bridge.ts', import.meta.url),
)

interface Built {
  text: string
  etag: string
}

/** The bundled script, built once at creation and answered with its ETag. */
export class ClientScript {
  private readonly built: Promise<Built>

  constructor(entry: string) {
    this.built = this.build(entry)
    // A failure surfaces in `ready()` or the first request; this only keeps it from being "unhandled" meanwhile.
    this.built.catch(() => {})
  }

  /** Resolves once the script is built; rejects with the build error. */
  async ready(): Promise<void> {
    await this.built
  }

  async answer(request: Request): Promise<Response> {
    const { text, etag } = await this.built
    if (matches(request.headers.get('if-none-match'), etag))
      return new Response(null, { status: 304, headers: { etag } })
    return new Response(text, { headers: { ...SCRIPT_HEADERS, etag } })
  }

  private async build(entry: string): Promise<Built> {
    const text = await bundleForBrowser(entry)
    return { text, etag: `"${await contentHash(text)}"` }
  }
}

/** `no-cache` means "ask again": the ETag then answers 304 while the script is the same. */
const SCRIPT_HEADERS = {
  'content-type': 'text/javascript; charset=utf-8',
  'cache-control': 'no-cache',
}

/**
 * Whether an `If-None-Match` names `etag` (RFC 9110 §13.1.2): a list of
 * tags is any of them, and a weak one (`W/"…"`, as a proxy that compressed
 * the script rewrites it) still names the same script.
 */
export function matches(ifNoneMatch: string | null, etag: string): boolean {
  if (!ifNoneMatch) return false
  const weakless = (tag: string) => tag.trim().replace(/^W\//, '')
  return ifNoneMatch.split(',').some((tag) => weakless(tag) === etag)
}

async function contentHash(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest).subarray(0, 16)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
