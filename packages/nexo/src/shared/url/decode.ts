/**
 * Internal, not a public module: the one rule for reading a URL path,
 * shared by boat (matching routes) and keep (finding files), so a URL can
 * never mean one thing to the router and another to the file server.
 */

/**
 * Decode one URL segment, escape by escape: each valid UTF-8 character is
 * decoded, and a malformed escape (`50%`, a lone `%C3`) stays as written
 * without keeping its neighbours encoded: `caf%C3%A9%C3` → `café%C3`.
 */
export function decodeSegment(part: string): string {
  return part.replace(/(?:%[0-9a-f]{2})+/gi, decodeRun)
}

/**
 * The segments of a path, as written: `/consola/nes` → `['consola', 'nes']`.
 * The root is no segments, and a trailing slash is ignored.
 */
export function splitSegments(path: string): string[] {
  const parts = path.replace(/^\//, '').split('/')
  if (parts.at(-1) === '') parts.pop()
  return parts
}

/**
 * The decoded segments of a pathname. `null` when a segment decodes to a
 * separator (`%2F`, `%5C`): it would blur where segments end, so such a
 * URL matches no route and no file.
 */
export function decodedSegments(pathname: string): string[] | null {
  const decoded = splitSegments(pathname).map(decodeSegment)
  return decoded.some(hasSeparator) ? null : decoded
}

/** A decoded segment that holds a `/` or `\` and so isn't one segment. */
export function hasSeparator(part: string): boolean {
  return part.includes('/') || part.includes('\\')
}

/** A run of escapes, one UTF-8 character at a time. */
function decodeRun(run: string): string {
  const bytes = run.match(/%[0-9a-f]{2}/gi)!
  let out = ''
  for (let i = 0; i < bytes.length;) {
    const size = Math.max(1, utf8Length(bytes[i]!))
    const char = tryDecode(bytes.slice(i, i + size).join(''))
    out += char ?? bytes[i]!
    i += char === null ? 1 : size
  }
  return out
}

/** How many bytes the character starting with this lead byte takes (0: not a lead byte). */
function utf8Length(escape: string): number {
  const byte = parseInt(escape.slice(1), 16)
  if (byte < 0x80) return 1
  if (byte >= 0xc2 && byte < 0xe0) return 2
  if (byte >= 0xe0 && byte < 0xf0) return 3
  return byte >= 0xf0 && byte < 0xf5 ? 4 : 0
}

function tryDecode(escapes: string): string | null {
  try {
    return decodeURIComponent(escapes)
  } catch {
    return null // not a whole, valid character: kept as written
  }
}
