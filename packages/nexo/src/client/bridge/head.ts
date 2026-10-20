/**
 * The head of a new page merged into the current one, in two steps so the
 * new page never shows unstyled: its new stylesheets go in first and are
 * waited for, then the rest. Elements written the same stay (the stylesheet
 * already loaded, the bridge script); scripts are never added, so nothing
 * runs — client code lives in modules that listen for `bridge:swapped`.
 * What goes in and out is decided once, up front, so placing a stylesheet
 * early never changes what the merge sees afterwards.
 */
export class HeadMerge {
  private readonly wanted: Set<string>
  private readonly present: Set<string>
  private readonly stale: Element[]
  private readonly fresh: Element[]

  constructor(private readonly incoming: Document) {
    this.wanted = new Set(markupOf(incoming.head))
    this.present = new Set(markupOf(document.head))
    this.stale = replaceable(document.head).filter((e) => this.missing(e))
    this.fresh = replaceable(incoming.head).filter((e) => this.missing(e))
  }

  /**
   * Assets marked `data-bridge-track` must be the same on both pages; when
   * a deploy changed one, the new page is loaded the browser's way so the
   * old code never runs against new markup. Scripts count here, though
   * the merge never places them.
   */
  trackedChanged(): boolean {
    const heads = [document.head, this.incoming.head]
    return heads
      .flatMap((head) => [...head.querySelectorAll(`[${TRACK}]`)])
      .some((element) => this.missing(element))
  }

  /**
   * The new stylesheets, placed and waited for before the body changes.
   * A sheet that takes too long is not worth a frozen page: the wait gives
   * up after a while. A page cancelled meanwhile (`signal`) takes its
   * sheets out again: they were never this page's.
   */
  async loadStyles(signal: AbortSignal): Promise<void> {
    const sheets = this.fresh.filter(isStylesheet)
    const undo = () => sheets.forEach((sheet) => sheet.remove())
    signal.addEventListener('abort', undo, { once: true })
    await Promise.all(sheets.map((sheet) => this.load(sheet)))
  }

  /** The title, the stale elements out, the new ones in (minus what `loadStyles` placed). */
  apply(): void {
    document.title = this.incoming.title
    for (const element of this.stale) element.remove()
    for (const element of this.fresh.filter(notPlaced)) this.place(element)
  }

  private load(sheet: Element): Promise<void> {
    return new Promise((resolve) => {
      sheet.addEventListener('load', () => resolve(), { once: true })
      sheet.addEventListener('error', () => resolve(), { once: true })
      setTimeout(resolve, STYLE_WAIT)
      this.place(sheet)
    })
  }

  private place(element: Element): void {
    document.head.append(document.adoptNode(element))
  }

  /** Not written the same in the other head: an element of this document is missing from the incoming one, and the reverse. */
  private missing(element: Element): boolean {
    const other =
      element.ownerDocument === document ? this.wanted : this.present
    return !other.has(element.outerHTML)
  }
}

const STYLE_WAIT = 3000

export const TRACK = 'data-bridge-track'

function markupOf(head: HTMLHeadElement): string[] {
  return [...head.children].map((element) => element.outerHTML)
}

/** Everything in a head but its title and scripts. */
function replaceable(head: HTMLHeadElement): Element[] {
  return [...head.children].filter(
    (element) => !['SCRIPT', 'TITLE'].includes(element.tagName),
  )
}

function isStylesheet(element: Element): boolean {
  return element.matches('link[rel="stylesheet"]')
}

/** Still in the incoming document: adopting an element makes it this document's. */
function notPlaced(element: Element): boolean {
  return element.ownerDocument !== document
}
