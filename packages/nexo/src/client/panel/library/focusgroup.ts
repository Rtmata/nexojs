import { panel } from '../panel'
import { Marks } from './marks'

/**
 * `focusgroup` (Open UI scoped-focusgroup explainer; shipped in Chrome 150):
 * arrow keys move focus among the group's items, the group is ONE tab stop,
 * and it remembers the last item on re-entry.
 *
 *   <div data-panel="focusgroup" focusgroup="toolbar inline wrap">…</div>
 *
 * GAP BRIDGE: Chromium 150+ does this natively, Safari,
 * Firefox and WebKitGTK don't (2026-11), and no feature check can tell
 * them apart. So the panel reads the same standard attribute and handles
 * the keys everywhere, marking them handled so the native behavior never
 * competes. Delete this panel when every engine ships it; the markup stays.
 */
export const focusgroup = panel({
  connect(el, _params, { signal }) {
    new FocusGroup(el as HTMLElement, readSpec(el), signal)
  },
})

/** What `focusgroup="<behavior> [inline|block] [wrap|nowrap] [nomemory]"` asks for. */
export interface FocusSpec {
  behavior: string
  axis: 'inline' | 'block' | 'both'
  wrap: boolean
  memory: boolean
}

const BEHAVIORS = new Set([
  'toolbar',
  'tablist',
  'radiogroup',
  'listbox',
  'menu',
  'menubar',
])

/** The minimum role each behavior implies: never over native or explicit roles. */
const ROLES: Record<string, string> = {
  toolbar: 'toolbar',
  tablist: 'tablist',
  radiogroup: 'radiogroup',
  listbox: 'listbox',
  menu: 'menu',
  menubar: 'menubar',
}

export function readSpec(el: Element): FocusSpec {
  const words = (el.getAttribute('focusgroup') ?? '').split(/\s+/)
  const behavior = words.find((w) => BEHAVIORS.has(w)) ?? 'toolbar'
  const memory = !words.includes('nomemory')
  return { behavior, axis: axisOf(words), wrap: wraps(behavior, words), memory }
}

function axisOf(words: string[]): FocusSpec['axis'] {
  if (words.includes('inline')) return 'inline'
  return words.includes('block') ? 'block' : 'both'
}

/** tablist and radiogroup wrap by default (APG); others only when asked. */
function wraps(behavior: string, words: string[]): boolean {
  if (words.includes('nowrap')) return false
  return (
    words.includes('wrap') ||
    behavior === 'tablist' ||
    behavior === 'radiogroup'
  )
}

const BLOCK: Record<string, number> = { ArrowUp: -1, ArrowDown: 1 }
const EDGES: Record<string, number> = { Home: -Infinity, End: Infinity }

const FOCUSABLE =
  'a[href], button, input, select, textarea, [tabindex], summary, [contenteditable="true"]'

/** Where arrows and Home / End move the caret, not the focus. */
const TYPING =
  'input:not([type=button],[type=submit],[type=reset],[type=checkbox],[type=radio],[type=range],[type=color],[type=file]), textarea, select, [contenteditable="true"]'

/**
 * One group: its items, one tab stop among them, arrow keys between them.
 * Items that come later get into the roving order too (a MutationObserver).
 */
export class FocusGroup {
  private readonly marks = new Marks()
  private current?: HTMLElement

  constructor(
    private readonly el: HTMLElement,
    private readonly spec: FocusSpec,
    signal: AbortSignal,
  ) {
    this.marks.default(el, 'role', ROLES[spec.behavior]!)
    this.settle(this.start())
    el.addEventListener('keydown', (e) => this.key(e), { signal })
    el.addEventListener('focusin', (e) => this.focused(e), { signal })
    el.addEventListener('focusout', (e) => this.left(e), { signal })
    this.watch(signal)
  }

  private watch(signal: AbortSignal): void {
    const observer = new MutationObserver(() => this.settle(this.current))
    observer.observe(this.el, { childList: true, subtree: true })
    signal.addEventListener(
      'abort',
      () => (observer.disconnect(), this.marks.restore()),
      { once: true },
    )
  }

  /** Items: focusable, enabled, not inside a nested group that opts out or is its own. */
  items(): HTMLElement[] {
    return [...this.el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (item) => this.owns(item),
    )
  }

  /** Owned, enabled and rendered: a hidden item would take the tab stop and lose the focus. */
  private owns(item: HTMLElement): boolean {
    if ((item as HTMLButtonElement).disabled || item.closest('[inert]'))
      return false
    if (!isRendered(item)) return false
    const group = item.parentElement?.closest('[focusgroup]')
    return group === this.el
  }

  /** On first entry: `focusgroupstart`, else the first item. */
  private start(): HTMLElement | undefined {
    const items = this.items()
    return items.find((i) => i.hasAttribute('focusgroupstart')) ?? items[0]
  }

  /** The one tab stop: `tabindex=0` on it, `-1` on the rest (roving tabindex). */
  settle(current: HTMLElement | undefined): void {
    const items = this.items()
    this.current = current && items.includes(current) ? current : items[0]
    for (const item of items)
      this.marks.set(item, 'tabindex', item === this.current ? '0' : '-1')
  }

  private focused(event: FocusEvent): void {
    const item = this.itemAround(event.target as Element)
    if (item) this.settle(item)
  }

  /** Leaving the group with `nomemory`: the next entry starts over. */
  private left(event: FocusEvent): void {
    if (this.el.contains(event.relatedTarget as Node | null)) return
    if (!this.spec.memory) this.settle(this.start())
  }

  /** The item of this group the target is (or is inside); none for a nested group's. */
  private itemAround(target: Element): HTMLElement | undefined {
    const group = target.closest('[focusgroup]')
    if (group !== this.el) return undefined
    return this.items().find((item) => item.contains(target))
  }

  private key(event: KeyboardEvent): void {
    const from = this.itemAround(event.target as Element)
    const step = this.stepFor(event.key)
    if (!from || step === undefined || typing(event.target as Element)) return
    if (event.altKey || event.ctrlKey || event.metaKey) return
    const next = this.target(step, from)
    if (!next) return
    event.preventDefault()
    this.settle(next)
    next.focus()
  }

  /** -1 / +1 for arrows on the group's axis, ±Infinity for Home / End. */
  private stepFor(key: string): number | undefined {
    return this.arrows()[key] ?? EDGES[key]
  }

  /** The axis's arrows; inline ones turn around right-to-left. */
  private arrows(): Record<string, number> {
    const rtl = getComputedStyle(this.el).direction === 'rtl'
    const inline = { ArrowLeft: rtl ? 1 : -1, ArrowRight: rtl ? -1 : 1 }
    if (this.spec.axis === 'inline') return inline
    return this.spec.axis === 'block' ? BLOCK : { ...inline, ...BLOCK }
  }

  private target(step: number, from: HTMLElement): HTMLElement | undefined {
    const items = this.items()
    if (step === -Infinity) return items[0]
    if (step === Infinity) return items.at(-1)
    const at = items.indexOf(from) + step
    if (at >= 0 && at < items.length) return items[at]
    return this.spec.wrap
      ? items[(at + items.length) % items.length]
      : undefined
  }
}

function typing(target: Element): boolean {
  return target.matches(TYPING)
}

export function isRendered(el: HTMLElement): boolean {
  return el.checkVisibility?.() ?? el.getClientRects().length > 0
}
