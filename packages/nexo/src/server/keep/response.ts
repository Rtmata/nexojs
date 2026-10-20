/**
 * `response` with `headers` added, where it had none of that name: what a
 * handler set on purpose stays. A copy, since some responses (a redirect)
 * come with their headers sealed.
 */
export function withHeaders(
  response: Response,
  headers: Iterable<readonly [string, string]>,
): Response {
  const copy = new Response(response.body, response)
  for (const [name, value] of headers)
    if (!copy.headers.has(name)) copy.headers.set(name, value)
  return copy
}
