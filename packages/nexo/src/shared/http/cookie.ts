/**
 * One cookie's value from a request's `Cookie` header: quotes taken off
 * and percent-decoded, as browsers and most servers write them; a value
 * that isn't valid percent-encoding is kept as written.
 */
export function cookieValue(
  request: Request,
  name: string,
): string | undefined {
  for (const pair of request.headers.get('cookie')?.split(';') ?? []) {
    const [key, ...value] = pair.trim().split('=')
    if (key === name) return decoded(value.join('=').trim())
  }
  return undefined
}

function decoded(raw: string): string {
  const value = raw.replace(/^"(.*)"$/, '$1')
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
