import { fileURLToPath } from 'node:url'
import { CLIENT_PATH } from '../../shared/bridge/vocabulary'
import type { Handler } from '../../shared/http/types'
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
 * The script is bundled from its TypeScript source the first time it is
 * asked for, then kept with an ETag, so browsers revalidate for free.
 */
export function bridge(): (handler: Handler) => Handler {
  const script = new ClientScript(CLIENT_ENTRY)
  return (handler) => (ctx) =>
    ctx.url.pathname === CLIENT_PATH ? script.answer(ctx.request) : handler(ctx)
}

const CLIENT_ENTRY = fileURLToPath(
  new URL('../../client/bridge/bridge.ts', import.meta.url),
)

interface Built {
  text: string
  etag: string
}

/** The bundled script, built once and answered with its ETag. */
class ClientScript {
  private built: Promise<Built> | undefined

  constructor(private readonly entry: string) {}

  async answer(request: Request): Promise<Response> {
    const { text, etag } = await (this.built ??= this.build())
    if (request.headers.get('if-none-match') === etag)
      return new Response(null, { status: 304, headers: { etag } })
    return new Response(text, { headers: { ...SCRIPT_HEADERS, etag } })
  }

  private async build(): Promise<Built> {
    const text = await bundleForBrowser(this.entry)
    return { text, etag: `"${await contentHash(text)}"` }
  }
}

/** `no-cache` means "ask again": the ETag then answers 304 while the script is the same. */
const SCRIPT_HEADERS = {
  'content-type': 'text/javascript; charset=utf-8',
  'cache-control': 'no-cache',
}

async function contentHash(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest).subarray(0, 16)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
