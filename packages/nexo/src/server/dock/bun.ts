/**
 * The Bun adapter: the only file in Nexo that talks to Bun's server API.
 * Everything else works with standard `Request` / `Response`, so another
 * runtime only needs another file like this one.
 */
export function listenWithBun(
  fetch: (request: Request) => Promise<Response>,
  port: number,
): { url: URL; stop: () => Promise<void> } {
  const server = Bun.serve({ port, fetch })
  return { url: server.url, stop: () => server.stop() }
}
