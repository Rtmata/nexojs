import { sameOrigin } from './origin'

/**
 * Whether a click is a plain navigation the page should handle, or one the
 * browser must keep: a modified click (new tab, download), a right or
 * middle button, a link to another site, a download, a link that opens
 * elsewhere, a jump to a place in this same page, or a click something
 * else already handled.
 */
export interface Click {
  button: number
  modified: boolean
  defaultPrevented: boolean
  href: string
  /** The URL of the page the click happened on. */
  pageHref: string
  download: boolean
  opensElsewhere: boolean
}

export function isPlainNavigation(click: Click): boolean {
  if (click.button !== 0 || click.modified || click.defaultPrevented)
    return false
  if (click.download || click.opensElsewhere) return false
  if (withinPage(click.href, click.pageHref)) return false
  return sameOrigin(click.href, new URL(click.pageHref).origin)
}

/** A plain left click on `link`, as if it had happened: what the link itself decides. A prefetch asks this first — a page a click would never use is not worth bringing. */
export function plainClickOn(link: HTMLAnchorElement): Click {
  return {
    button: 0,
    modified: false,
    defaultPrevented: false,
    href: link.href,
    pageHref: location.href,
    download: link.hasAttribute('download'),
    opensElsewhere: link.target !== '' && link.target !== '_self',
  }
}

/** A link to a place in this same page (`#section`): the browser jumps there, nothing to fetch. */
function withinPage(href: string, pageHref: string): boolean {
  const [page, hash] = href.split('#')
  return hash !== undefined && page === pageHref.split('#')[0]
}
