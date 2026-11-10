import { panel } from '../panel'
import { oneOf } from '../params'
import { FocusGroup, readSpec } from './focusgroup'
import { uniqueId } from './ids'
import { Marks } from './marks'

/**
 * Tabs (WAI-ARIA APG Tabs). Layer 0 is links to sections by id, all shown
 * in order (GOV.UK's pattern): without JS it's a page with a table of
 * contents. With JS: one panel at a time, arrow keys among the tabs
 * (`focusgroup="tablist inline"`), the panel shown on focus (`automatic`,
 * APG's choice when panels show without delay) or on Enter/Space/click
 * (`manual`). The first tab shown is the URL's `#hash`, else
 * `aria-selected="true"`, else the first; the selected tab is the tab
 * stop (APG). A link whose `#hash` names no section is an error.
 *
 *   <div data-panel="tabs">
 *     <ul><li><a href="#games">Games</a></li><li><a href="#screens">Screens</a></li></ul>
 *     <section id="games">…</section><section id="screens">…</section>
 *   </div>
 */
export const tabs = panel({
  params: { activation: oneOf(['automatic', 'manual'], 'automatic') },
  connect: (el, { activation }, { signal }) =>
    new Tabs(el as HTMLElement, activation === 'manual', signal),
  events: {
    'click [role=tab]': (event, ctx, tab) =>
      ctx.clicked(event, tab as HTMLElement),
    'keydown [role=tab]': (event, ctx, tab) =>
      ctx.key(event as KeyboardEvent, tab as HTMLElement),
    'focusin [role=tab]': (_event, ctx, tab) => ctx.focused(tab as HTMLElement),
  },
})

interface Tab {
  tab: HTMLAnchorElement
  panel: HTMLElement
}

class Tabs {
  private readonly marks = new Marks()
  private readonly list: Tab[]
  private readonly group: FocusGroup

  constructor(
    el: HTMLElement,
    private readonly manual: boolean,
    signal: AbortSignal,
  ) {
    this.list = pairsIn(el)
    const tablist = this.listOf(el)
    this.marks.default(tablist, 'focusgroup', 'tablist inline')
    for (const pair of this.list) this.roles(pair)
    this.group = new FocusGroup(tablist, readSpec(tablist), signal)
    this.select(this.initial())
    signal.addEventListener('abort', () => this.marks.restore(), { once: true })
  }

  clicked(event: Event, tab: HTMLElement): void {
    event.preventDefault()
    this.select(this.indexOf(tab))
  }

  /** Manual activation: Enter (a link's click) or Space. */
  key(event: KeyboardEvent, tab: HTMLElement): void {
    if (event.key !== ' ') return
    event.preventDefault()
    this.select(this.indexOf(tab))
  }

  focused(tab: HTMLElement): void {
    if (!this.manual) this.select(this.indexOf(tab))
  }

  /** One panel shown; the selected tab is the tab stop (APG). */
  private select(at: number): void {
    this.list.forEach(({ tab, panel }, i) => {
      this.marks.set(tab, 'aria-selected', String(i === at))
      this.marks.toggle(panel, 'hidden', i !== at)
    })
    this.group.settle(this.list[at]?.tab)
  }

  private initial(): number {
    const fromHash = this.list.findIndex(
      ({ panel }) => `#${panel.id}` === location.hash,
    )
    if (fromHash >= 0) return fromHash
    return Math.max(
      0,
      this.list.findIndex(
        ({ tab }) => tab.getAttribute('aria-selected') === 'true',
      ),
    )
  }

  private indexOf(tab: HTMLElement): number {
    return this.list.findIndex((pair) => pair.tab === tab)
  }

  /** The links' list (`ul`, `ol`, `nav`), else their parent; list items become presentation. */
  private listOf(el: HTMLElement): HTMLElement {
    const first = this.list[0]!.tab
    const tablist =
      first.closest<HTMLElement>('ul, ol, nav') ?? first.parentElement ?? el
    for (const item of tablist.querySelectorAll(':scope > li'))
      this.marks.set(item, 'role', 'presentation')
    return tablist
  }

  /** APG roles and the links between each tab and its panel. */
  private roles({ tab, panel }: Tab): void {
    if (!tab.id) this.marks.set(tab, 'id', uniqueId('tab-1'))
    this.marks.set(tab, 'role', 'tab')
    this.marks.set(tab, 'aria-controls', panel.id)
    this.marks.set(panel, 'role', 'tabpanel')
    this.marks.set(panel, 'aria-labelledby', tab.id)
    if (!startsFocusable(panel)) this.marks.default(panel, 'tabindex', '0')
  }
}

/**
 * The tabs: the links of the first link's list (`ul`, `ol`, `nav`), each
 * with its section; a dead link there is an error. Links inside the
 * sections are the author's content, not tabs.
 */
function pairsIn(el: HTMLElement): Tab[] {
  const first = el.querySelector<HTMLAnchorElement>('a[href^="#"]')
  if (!first)
    throw new Error(
      'tabs: no links to sections inside this panel (<a href="#id"> → <section id>)',
    )
  const links = tabLinks(el, first)
  return links.map((tab) => ({ tab, panel: sectionOf(el, tab) }))
}

function sectionOf(el: HTMLElement, tab: HTMLAnchorElement): HTMLElement {
  const id = tab.hash.slice(1)
  const panel = el.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`)
  if (panel) return panel
  throw new Error(
    `panel: tabs: <a href="#${id}"> names no section inside the panel`,
  )
}

/** APG: a panel gets tabindex=0 unless its first content is focusable. */
function startsFocusable(panel: HTMLElement): boolean {
  const first = panel.firstElementChild
  return (
    first !== null &&
    first.matches('a[href], button, input, select, textarea, [tabindex]')
  )
}

/**
 * The tab links: those of the first link's list (`ul`, `ol`, `nav`) inside
 * the panel. With no such list, every link not inside an element with an
 * `id` (the sections have ids; the tab bar has none).
 */
function tabLinks(
  el: HTMLElement,
  first: HTMLAnchorElement,
): HTMLAnchorElement[] {
  const list = first.closest<HTMLElement>('ul, ol, nav')
  const all = [...el.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')]
  if (list && el.contains(list)) return all.filter((a) => list.contains(a))
  return all.filter(
    (a) => a.parentElement?.closest('[id]') === el.closest('[id]'),
  )
}
