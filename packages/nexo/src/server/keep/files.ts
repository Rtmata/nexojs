import { readFile, stat } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import type { Handler } from '../../shared/boat'
import { contentType } from './mime'

/**
 * A handler that serves files from a folder. Use it on a wildcard route; the
 * part of the URL matched by `*` is the file path inside the folder:
 *
 *   router.get('/covers/*', files('./data/covers'))
 *   // GET /covers/nes/zelda.png → ./data/covers/nes/zelda.png
 *
 * Missing files answer a plain 404.
 */
export function files(folder: string): Handler<{ '*': string }> {
  return async ({ params }) =>
    (await serveFile(folder, params['*'])) ??
    new Response('Not Found', { status: 404 })
}

/**
 * Read `path` inside `folder` and build its response, or return `null` if
 * there is no such file. Paths that try to leave the folder (`../`) are
 * treated as missing.
 */
export async function serveFile(
  folder: string,
  path: string,
): Promise<Response | null> {
  const root = resolve(folder)
  const target = resolve(root, path.replace(/^\/+/, ''))
  if (target !== root && !target.startsWith(root + sep)) return null

  const info = await stat(target).catch(() => null)
  if (!info?.isFile()) return null

  const body = await readFile(target)
  return new Response(body, {
    headers: {
      'content-type': contentType(target),
      'content-length': String(info.size),
    },
  })
}
