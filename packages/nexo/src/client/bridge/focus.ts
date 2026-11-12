import { segmentIn } from './attributes'

/**
 * Where the focus goes after a swap (`data-bridge-focus`, inherited like
 * every attribute): `auto` (the default), `keep`, `autofocus`, `target`,
 * `none`, or the name of a segment.
 */
export type Focus =
  'auto' | 'keep' | 'autofocus' | 'target' | 'none' | { segment: string }

const WORDS = ['auto', 'keep', 'autofocus', 'target', 'none'] as const

/** The attribute's value as a rule; anything that is not one of the words names a segment. */
export function focusOf(value: string | null): Focus {
  if (value === null) return 'auto'
  const word = value.trim()
  if ((WORDS as readonly string[]).includes(word)) return word as Focus
  return { segment: word }
}

/**
 * Moves the focus once the new content is in, so a screen reader hears
 * the change and Tab goes on from there. `auto` is Unpoly's chain: the
 * element a `#hash` names; else the focused element, kept when one with
 * the same id is in the new content (a search field while its results
 * refresh); else the new content's `autofocus`; else, only when the
 * focus was lost with the old content, the new element itself. A whole
 * page's "element itself" is the body: the document's start, as after a
 * native navigation. Nothing scrolls: that was decided before.
 */
export class FocusMove {
  constructor(
    private readonly rule: Focus,
    private readonly hash: string,
  ) {}

  /** `elements`: what is new; `before`: what had the focus before the swap. */
  after(elements: Element[], before: Element | null): void {
    const { rule } = this
    if (rule === 'none') return
    if (rule === 'auto') return this.auto(elements, before)
    if (rule === 'keep') return void this.kept(before)
    if (rule === 'autofocus') return void autofocused(elements)
    if (rule === 'target') return void give(elements[0])
    if (!give(segmentIn(document, rule.segment))) noSegment(rule.segment)
  }

  private auto(elements: Element[], before: Element | null): void {
    if (this.byHash() || this.kept(before) || autofocused(elements)) return
    if (lost(before)) give(elements[0])
  }

  private byHash(): boolean {
    const id = this.hash.slice(1)
    return id ? give(document.getElementById(decodeURIComponent(id))) : false
  }

  /** The element that had the focus is still here, or one with its id took its place. */
  private kept(before: Element | null): boolean {
    if (!before || before === document.body) return false
    if (before.isConnected) return true
    return before.id ? give(document.getElementById(before.id)) : false
  }
}

/** The focus went with the old content: nothing has it now, or the body does. */
function lost(before: Element | null): boolean {
  return !before || !before.isConnected || before === document.body
}

function autofocused(elements: Element[]): boolean {
  const found = elements
    .map((e) => (e.matches('[autofocus]') ? e : e.querySelector('[autofocus]')))
    .find((e) => e !== null)
  return give(found ?? null)
}

/** Focus without scrolling; an element that can't take it is made able to, until it lets go. */
function give(element: Element | null | undefined): boolean {
  if (!(element instanceof HTMLElement)) return false
  if (!element.hasAttribute('tabindex') && !focusable(element)) lend(element)
  element.focus({ preventScroll: true })
  return document.activeElement === element
}

/** A `tabindex` for now, gone with the focus. */
function lend(element: HTMLElement): void {
  element.setAttribute('tabindex', '-1')
  const giveBack = () => element.removeAttribute('tabindex')
  element.addEventListener('blur', giveBack, { once: true })
}

const FOCUSABLE =
  'a[href], button, input, select, textarea, summary, [contenteditable]'

function focusable(element: HTMLElement): boolean {
  return element.matches(FOCUSABLE)
}

/** Markup that names a segment the page doesn't have: reported. */
function noSegment(name: string): void {
  reportError(new Error(`bridge: data-bridge-focus names no segment "${name}"`))
}
