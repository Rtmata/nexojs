/**
 * A redirect, as a normal `Response`: return it (or throw it) from a
 * handler or a loader.
 *
 *   router.get('/', () => redirect('/en'))
 *   load: (ctx) => findOld(ctx.params.id) ? redirect(newUrl, 301) : …
 *
 * 302 (temporary) unless another status is given. The location may be
 * relative to the site: `/en`.
 */
export function redirect(
  location: string,
  status: RedirectStatus = 302,
): Response {
  return new Response(null, { status, headers: { location } })
}

export type RedirectStatus = 301 | 302 | 303 | 307 | 308
