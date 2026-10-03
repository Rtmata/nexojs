import type { Handler } from '../../shared/http/types'
import { SafeFile } from './static/safe-file'

/**
 * A handler that serves files from a folder. Use it on a wildcard route; the
 * part of the URL matched by `*` is the file path inside the folder:
 *
 *   router.get('/covers/*', files('./data/covers'))
 *   // GET /covers/nes/zelda.png → ./data/covers/nes/zelda.png
 *
 * Missing files answer a plain 404. Only safe paths are served (see `SafeFile`).
 */
export function files(folder: string): Handler<{ '*': string }> {
  const safe = new SafeFile(folder)
  return async ({ params, request }) =>
    (await safe.serve(params['*'], request.headers.get('range'))) ??
    new Response('Not Found', { status: 404 })
}
