import { panel } from '../panel'
import { bridgeCommands } from './commands'
import { emit } from './hold'
import { isRendered } from './focusgroup'
import { Marks } from './marks'
import { Options } from './options'
import { Typeahead } from './typeahead'

/**
 * Menu (WAI-ARIA APG Menu and Menubar + Menu Button), in Open UI's shape.
 * Layer 0 is the native popover and its invoker:
 *
 *   <button commandfor="acts" command="toggle-popover">⋯</button>
 *   <div id="acts" data-panel="menu" popover>
 *     <button>Favorite</button>
 *     <button commandfor="export" command="toggle-popover">Export</button>
 *     <div id="export" popover><button>JSON</button><button>CSV</button></div>
 *   </div>
 *
 * On a popover it's a menu; on an in-page element, a menubar. Buttons and
 * links become `menuitem`; write `role="menuitemcheckbox"` or
 * `"menuitemradio"` with `aria-checked` for checkable items (radios group
 * by the nearest `role="group"`). The panel adds the roles, focus into a
 * menu when it opens, APG's keys and typeahead, and `menu:select` with
 * `{ value, checked }` when an item is chosen.
 */
export const menu = panel({
  connect: (el, _params, { signal }) => new Menu(el as HTMLElement, signal),
})

const ITEM = '[role=menuitem], [role=menuitemcheckbox], [role=menuitemradio]'
const MENU = '[role=menu], [role=menubar]'
const CHECKABLE = new Set(['menuitemcheckbox', 'menuitemradio'])

type Where = 'first' | 'last'

class Menu {
  private readonly marks = new Marks()
  private readonly typeahead: Typeahead
  /** Which invoker opened each menu: where focus returns. */
  private readonly openers = new Map<HTMLElement, HTMLElement>()
  private opening: Where = 'first'

  constructor(
    private readonly root: HTMLElement,
    signal: AbortSignal,
  ) {
    this.typeahead = new Typeahead(signal)
    this.prepare(signal)
    this.listen(signal)
    signal.addEventListener('abort', () => this.marks.restore(), { once: true })
  }

  private get bar(): boolean {
    return !this.root.hasAttribute('popover')
  }

  /** Every menu of the tree: the root if it pops over, and each popover inside. */
  private popovers(): HTMLElement[] {
    const inside = [...this.root.querySelectorAll<HTMLElement>('[popover]')]
    return this.bar ? inside : [this.root, ...inside]
  }

  private prepare(signal: AbortSignal): void {
    this.marks.set(this.root, 'role', this.bar ? 'menubar' : 'menu')
    for (const popover of this.popovers()) this.prepareMenu(popover, signal)
    for (const item of this.root.querySelectorAll('button, a[href]'))
      this.prepareItem(item)
    if (this.bar) this.rove(this.itemsOf(this.root)[0])
  }

  private prepareMenu(popover: HTMLElement, signal: AbortSignal): void {
    this.marks.set(popover, 'role', 'menu')
    for (const trigger of triggersOf(popover))
      this.prepareTrigger(popover, trigger, signal)
    popover.addEventListener(
      'toggle',
      (e) => this.toggled(popover, e as ToggleEvent),
      { signal },
    )
    bridgeCommands(popover, signal)
  }

  /** An invoker says it opens a menu; a click on it is remembered as the opener (focus returns there). */
  private prepareTrigger(
    popover: HTMLElement,
    trigger: HTMLElement,
    signal: AbortSignal,
  ): void {
    this.marks.default(trigger, 'aria-haspopup', 'menu')
    this.marks.set(trigger, 'aria-expanded', 'false')
    const remember = () => this.openers.set(popover, trigger)
    trigger.addEventListener('click', remember, { signal })
  }

  private prepareItem(item: Element): void {
    this.marks.default(item, 'role', 'menuitem')
    if (CHECKABLE.has(item.getAttribute('role')!))
      this.marks.default(item, 'aria-checked', 'false')
    this.marks.set(item, 'tabindex', '-1')
  }

  private listen(signal: AbortSignal): void {
    const on = { signal }
    this.root.addEventListener('keydown', (e) => this.key(e), on)
    this.root.addEventListener('click', (e) => this.clicked(e), on)
    this.root.addEventListener('focusout', (e) => this.left(e), on)
    this.root.addEventListener(
      'focusin',
      (e) => this.bar && this.rove(e.target as HTMLElement),
      on,
    )
    this.listenTrigger(signal)
  }

  private listenTrigger(signal: AbortSignal): void {
    const trigger = this.bar ? null : triggerOf(this.root)
    trigger?.addEventListener('keydown', (e) => this.triggerKey(e), { signal })
  }

  /** The menu button's ↓ and ↑ open it on its first or last item (APG). */
  private triggerKey(event: KeyboardEvent): void {
    const where = ({ ArrowDown: 'first', ArrowUp: 'last' } as const)[
      event.key as 'ArrowDown'
    ]
    if (!where) return
    event.preventDefault()
    this.open(this.root, where, triggerOf(this.root)!)
  }

  /** Opened: its trigger says so and focus moves in; closed: focus back to the trigger. */
  private toggled(popover: HTMLElement, event: ToggleEvent): void {
    const open = event.newState === 'open'
    for (const trigger of triggersOf(popover))
      trigger.setAttribute('aria-expanded', String(open))
    if (open) return this.focusIn(popover)
    const lost =
      document.activeElement === document.body ||
      popover.contains(document.activeElement)
    if (lost) (this.openers.get(popover) ?? triggerOf(popover))?.focus()
  }

  private focusIn(popover: HTMLElement): void {
    const items = this.itemsOf(popover)
    ;(this.opening === 'last' ? items.at(-1) : items[0])?.focus()
    this.opening = 'first'
  }

  private open(popover: HTMLElement, where: Where, source: HTMLElement): void {
    this.openers.set(popover, source)
    this.opening = where
    if (popover.matches(':popover-open')) return this.focusIn(popover)
    ;(popover.showPopover as (o?: { source: Element }) => void)({ source })
  }

  /** The items a menu owns, not those of the menus inside it. */
  private itemsOf(menu: Element): HTMLElement[] {
    const items = [...menu.querySelectorAll<HTMLElement>(ITEM)]
    return items.filter(
      (item) =>
        item.parentElement?.closest(MENU) === menu &&
        !isDisabled(item) &&
        isRendered(item),
    )
  }

  /** The menubar's one tab stop (roving tabindex). */
  private rove(current: HTMLElement | undefined): void {
    const items = this.itemsOf(this.root)
    if (!current || !items.includes(current)) return
    for (const item of items) item.tabIndex = item === current ? 0 : -1
  }

  private key(event: KeyboardEvent): void {
    const item = (event.target as Element).closest<HTMLElement>(ITEM)
    if (!item || event.ctrlKey || event.altKey || event.metaKey) return
    if (new MenuKey(this, item, event).run()) event.preventDefault()
  }

  /** A click (or Enter, which clicks): checkables flip, then the whole menu closes. */
  private clicked(event: MouseEvent): void {
    const item = (event.target as Element).closest<HTMLElement>(ITEM)
    if (!item || isDisabled(item) || this.submenuOf(item)) return
    this.check(item)
    this.closeAll()
  }

  /** Space on a checkable: it flips, the menu stays (APG). */
  check(item: HTMLElement): void {
    const role = item.getAttribute('role')!
    if (role === 'menuitemradio') this.uncheckGroup(item)
    if (CHECKABLE.has(role))
      this.marks.set(
        item,
        'aria-checked',
        String(!isChecked(item) || role === 'menuitemradio'),
      )
    const checked = CHECKABLE.has(role) ? isChecked(item) : undefined
    emit(this.root, 'menu:select', { value: Options.valueOf(item), checked })
  }

  private uncheckGroup(item: HTMLElement): void {
    const group = item.closest('[role=group], [role=menu], [role=menubar]')!
    for (const other of group.querySelectorAll('[role=menuitemradio]'))
      if (other.closest('[role=group], [role=menu], [role=menubar]') === group)
        this.marks.set(other, 'aria-checked', 'false')
  }

  /**
   * Focus went somewhere else: every menu closes (Tab, APG). Focus going
   * nowhere is a popover hiding with focus inside (Firefox drops it to
   * <body>); `toggled` brings it back, and clicks outside are the popover's
   * own light dismiss.
   */
  private left(event: FocusEvent): void {
    const to = event.relatedTarget as Node | null
    if (!to || this.root.contains(to) || triggerOf(this.root) === to) return
    for (const open of this.openMenus()) open.hidePopover()
  }

  /** Close every open menu of the tree; focus goes back to the top trigger. */
  closeAll(): void {
    const top = this.bar
      ? this.openMenus().find((m) => this.parentMenu(m) === this.root)
      : this.root
    if (top?.matches(':popover-open')) top.hidePopover()
  }

  private openMenus(): HTMLElement[] {
    return this.popovers().filter((p) => p.matches(':popover-open'))
  }

  /** The menu a submenu trigger opens, when it's one of this tree's. */
  submenuOf(item: HTMLElement): HTMLElement | undefined {
    const id = item.getAttribute('commandfor')
    return this.popovers().find((p) => p.id === id)
  }

  /** The menu that holds this menu's trigger (a menu, or the menubar). */
  parentMenu(menu: HTMLElement): Element | null | undefined {
    return triggerOf(menu)?.closest(MENU)
  }

  isBar(menu: Element): boolean {
    return menu === this.root && this.bar
  }

  items(menu: Element): HTMLElement[] {
    return this.itemsOf(menu)
  }

  openSub(item: HTMLElement, where: Where): boolean {
    const sub = this.submenuOf(item)
    if (sub) this.open(sub, where, item)
    return sub !== undefined
  }

  find(
    key: string,
    items: HTMLElement[],
    from: HTMLElement,
  ): HTMLElement | undefined {
    return this.typeahead.find(key, items, from)
  }
}

/**
 * One key in one menu (APG Menu and Menubar): the arrows of its axis move
 * and wrap, the cross axis opens or leaves submenus, Home / End, Space on
 * checkables, typeahead. `run()` says whether it was handled.
 */
class MenuKey {
  private readonly menu: Element
  private readonly bar: boolean

  constructor(
    private readonly tree: Menu,
    private readonly item: HTMLElement,
    private readonly event: KeyboardEvent,
  ) {
    this.menu = item.closest(MENU)!
    this.bar = tree.isBar(this.menu)
  }

  run(): boolean {
    const { key } = this.event
    const [next, prev, deeper] = this.bar
      ? ['ArrowRight', 'ArrowLeft', 'ArrowDown']
      : ['ArrowDown', 'ArrowUp', 'ArrowRight']
    if (key === next || key === prev) return this.move(key === next ? 1 : -1)
    const opens = key === deeper || (this.bar && key === 'ArrowUp')
    if (opens && this.deeper(key === 'ArrowUp')) return true
    return this.other(key)
  }

  private other(key: string): boolean {
    if (key === 'Home' || key === 'End') return this.edge(key === 'Home')
    if (key === 'ArrowLeft' || key === 'ArrowRight')
      return this.across(key === 'ArrowRight' ? 1 : -1)
    if (key === ' ' && CHECKABLE.has(this.item.getAttribute('role')!))
      return (this.tree.check(this.item), true)
    return this.typed(key)
  }

  private move(by: number): boolean {
    const items = this.tree.items(this.menu)
    const at = (items.indexOf(this.item) + by + items.length) % items.length
    items[at]?.focus()
    return true
  }

  private edge(first: boolean): boolean {
    const items = this.tree.items(this.menu)
    ;(first ? items[0] : items.at(-1))?.focus()
    return true
  }

  /** Into the item's submenu, on its first item (its last with ↑ on a menubar). */
  private deeper(last: boolean): boolean {
    return this.tree.openSub(this.item, last ? 'last' : 'first')
  }

  /**
   * The cross axis inside a menu: ← leaves a submenu for its parent item,
   * or, under a menubar, goes to the bar's neighbour; → does the same on
   * an item that opens nothing.
   */
  private across(by: number): boolean {
    const parent = this.tree.parentMenu(this.menu as HTMLElement)
    if (!parent) return false
    if (parent.getAttribute('role') === 'menubar')
      return this.neighbour(parent, by)
    if (by > 0) return false
    triggerOf(this.menu as HTMLElement)?.focus()
    ;(this.menu as HTMLElement).hidePopover()
    return true
  }

  /** Under a menubar: close this menu, go to the bar's next item and open its menu. */
  private neighbour(bar: Element, by: number): boolean {
    const items = this.tree.items(bar)
    const from = items.findIndex((i) => this.tree.submenuOf(i) === this.menu)
    const to = items[(from + by + items.length) % items.length]!
    this.tree.closeAll()
    to.focus()
    this.tree.openSub(to, 'first')
    return true
  }

  private typed(key: string): boolean {
    const found = this.tree.find(key, this.tree.items(this.menu), this.item)
    found?.focus()
    return found !== undefined
  }
}

/** The button whose `commandfor` names this popover. */
/** Every button whose `commandfor` names this popover. */
function triggersOf(popover: HTMLElement): HTMLElement[] {
  if (!popover.id) return []
  return [
    ...document.querySelectorAll<HTMLElement>(
      `[commandfor="${CSS.escape(popover.id)}"]`,
    ),
  ]
}

function triggerOf(popover: HTMLElement): HTMLElement | null {
  return triggersOf(popover)[0] ?? null
}

function isDisabled(item: Element): boolean {
  return (
    (item as HTMLButtonElement).disabled ||
    item.getAttribute('aria-disabled') === 'true'
  )
}

function isChecked(item: Element): boolean {
  return item.getAttribute('aria-checked') === 'true'
}
