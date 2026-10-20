import type { Handler } from '../../shared/http/types'
import { ensureCacheOption, type CacheOption } from './static/freshness'
import { SafeFile } from './static/safe-file'

/**
 * A handler that serves files from a folder. Use it on a wildcard route; the
 * part of the URL matched by `*` is the file path inside the folder:
 *
 *   router.get('/covers/*', files('./data/covers'))
 *   router.get('/media/*', files('./data/media', { cache: 'immutable' }))
 *   // GET /covers/nes/zelda.png → ./data/covers/nes/zelda.png
 *
 * Missing files answer a plain 404. Only safe paths are served (see
 * `SafeFile`); `cache` says how long browsers may keep them (see `CacheOption`).
 */
export function files(
  folder: string,
  options: { cache?: CacheOption } = {},
): Handler<{ '*': string }> {
  const safe = new SafeFile(folder, ensureCacheOption(options.cache))
  return async ({ params, request }) =>
    (await safe.serve(params['*'], request.headers)) ??
    new Response('Not Found', { status: 404 })
}
