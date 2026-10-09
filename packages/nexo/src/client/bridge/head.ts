/**
 * The head of a new page merged into the current one: elements written the
 * same stay (the stylesheet already loaded, the bridge script), the rest is
 * replaced by the new page's. Scripts are never added, so nothing runs;
 * client code lives in modules that listen for `bridge:swapped`.
 */
export function mergeHead(incoming: Document): void {
  document.title = incoming.title
  const wanted = new Set(markupOf(incoming.head))
  for (const element of [...document.head.children])
    if (!wanted.has(element.outerHTML) && isReplaceable(element))
      element.remove()
  const present = new Set(markupOf(document.head))
  for (const element of [...incoming.head.children])
    if (!present.has(element.outerHTML) && isReplaceable(element))
      document.head.append(document.adoptNode(element))
}

/**
 * New stylesheets go in before the body changes and are waited for, so the
 * new page never shows unstyled. A sheet that takes too long is not worth
 * a frozen page: the wait gives up after a while.
 */
export async function loadNewStyles(incoming: Document): Promise<void> {
  const present = new Set(markupOf(document.head))
  const sheets = [...incoming.head.querySelectorAll('link[rel="stylesheet"]')]
    .filter((link) => !present.has(link.outerHTML))
    .map((link) => document.adoptNode(link))
  await Promise.all(sheets.map(loaded))
}

function loaded(link: Element): Promise<void> {
  return new Promise((resolve) => {
    link.addEventListener('load', () => resolve(), { once: true })
    link.addEventListener('error', () => resolve(), { once: true })
    setTimeout(resolve, STYLE_WAIT)
    document.head.append(link)
  })
}

const STYLE_WAIT = 3000

/**
 * Assets marked `data-bridge-track` must be the same on both pages; when a
 * deploy changed one, the new page is loaded the browser's way so the old
 * code never runs against new markup.
 */
export function trackedChanged(incoming: Document): boolean {
  const tracked = (head: HTMLHeadElement) =>
    [...head.querySelectorAll(`[${TRACK}]`)].map((e) => e.outerHTML).sort()
  return tracked(document.head).join() !== tracked(incoming.head).join()
}

export const TRACK = 'data-bridge-track'

function markupOf(head: HTMLHeadElement): string[] {
  return [...head.children].map((element) => element.outerHTML)
}

function isReplaceable(element: Element): boolean {
  return !['SCRIPT', 'TITLE'].includes(element.tagName)
}
