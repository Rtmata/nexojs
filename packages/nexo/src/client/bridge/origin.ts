/** Whether `href` (absolute or relative to `origin`) stays on `origin`; what can't be parsed is nowhere. */
export function sameOrigin(href: string, origin: string): boolean {
  try {
    return new URL(href, origin).origin === origin
  } catch {
    return false
  }
}
