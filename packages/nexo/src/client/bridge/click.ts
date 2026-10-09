/**
 * Whether a click is a plain navigation the page should handle, or one the
 * browser must keep: a modified click (new tab, download), a right or
 * middle button, a link to another site, a download, a link that opens
 * elsewhere, or a click something else already handled.
 */
export interface Click {
  button: number
  modified: boolean
  defaultPrevented: boolean
  href: string
  pageOrigin: string
  download: boolean
  opensElsewhere: boolean
}

export function isPlainNavigation(click: Click): boolean {
  if (click.button !== 0 || click.modified || click.defaultPrevented)
    return false
  if (click.download || click.opensElsewhere) return false
  return sameOrigin(click.href, click.pageOrigin)
}

function sameOrigin(href: string, origin: string): boolean {
  try {
    return new URL(href, origin).origin === origin
  } catch {
    return false
  }
}
