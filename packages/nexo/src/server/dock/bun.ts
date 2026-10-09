/**
 * The Bun adapter: the only file in Nexo that talks to Bun's own APIs.
 * Everything else works with standard `Request`, `Response` and `Blob`, so
 * another runtime only needs another file like this one.
 */

/** A server listening on a port, and how to stop it. */
export interface Listening {
  url: URL
  /** Stop listening; `force` also closes the connections still open. */
  stop(force: boolean): Promise<void>
}

/** `idleTimeout`: seconds a connection may send nothing before it's closed (0: never). */
export function listenWithBun(
  fetch: (request: Request) => Promise<Response>,
  port: number,
  idleTimeout: number,
): Listening {
  const server = Bun.serve({ port, fetch, idleTimeout })
  return { url: server.url, stop: (force) => stopBun(server, force) }
}

/**
 * Bun closes the connections at once when forced, but that promise can stay
 * pending while a stream is still waiting for data, so only a graceful stop
 * is awaited.
 */
async function stopBun(server: Bun.Server<unknown>, force: boolean) {
  const stopped = server.stop(force)
  if (!force) await stopped
}

/** A file on disk as a standard `Blob`: read lazily, streamed when sent. */
export function fileBlob(path: string): Blob {
  return Bun.file(path)
}

/**
 * One browser-ready script from a TypeScript entry file and everything it
 * imports, types stripped, nothing minified: the one transformation client
 * code goes through. Bun's bundler does it in memory.
 */
export async function bundleForBrowser(entry: string): Promise<string> {
  const built = await Bun.build({
    entrypoints: [entry],
    target: 'browser',
    format: 'esm',
  })
  if (!built.success)
    throw new Error(`dock: can't bundle ${entry}:\n${built.logs.join('\n')}`)
  return built.outputs[0]!.text()
}
