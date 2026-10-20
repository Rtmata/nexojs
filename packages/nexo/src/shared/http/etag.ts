/**
 * Whether an `If-None-Match` names `etag` (RFC 9110 §13.1.2): a list of
 * tags is any of them, `*` is any at all, and a weak tag (`W/"…"`, as a
 * proxy that compressed the body rewrites it) still names the same thing.
 * Weak comparison, the one this header asks for.
 */
export function matches(ifNoneMatch: string | null, etag: string): boolean {
  if (!ifNoneMatch) return false
  if (ifNoneMatch.trim() === '*') return true
  return ifNoneMatch.split(',').some((tag) => weakless(tag) === weakless(etag))
}

function weakless(tag: string): string {
  return tag.trim().replace(/^W\//, '')
}
