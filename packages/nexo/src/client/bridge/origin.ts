/** `href` (absolute or relative to `base`) as a URL; what can't be parsed is nowhere: null. */
export function parsed(href: string, base: string): URL | null {
  try {
    return new URL(href, base)
  } catch {
    return null
  }
}

/** Whether `href` (absolute or relative to `origin`) stays on `origin`. */
export function sameOrigin(href: string, origin: string): boolean {
  return parsed(href, origin)?.origin === origin
}
