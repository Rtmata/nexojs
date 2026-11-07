import { panel } from '../panel'
import { oneOf } from '../params'
import { FocusGroup, readSpec } from './focusgroup'

/**
 * Tabs (WAI-ARIA APG Tabs). Layer 0 is links to sections by id, all shown
 * in order (GOV.UK's pattern): without JS it's a page with a table of
 * contents. With JS: one panel at a time, arrow keys among the tabs
 * (`focusgroup="tablist inline"`), the panel shown on focus (`automatic`,
 * APG's choice when panels show without delay) or on Enter/Space/click
 * (`manual`). The first tab shown is the URL's `#hash`, else
 * `aria-selected="true"`, else the first.
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

let made = 0

class Tabs {
  private readonly list: Tab[]

  constructor(
    el: HTMLElement,
    private readonly manual: boolean,
    signal: AbortSignal,
  ) {
    this.list = pairsIn(el)
    const tablist = listOf(this.list, el)
    if (!tablist.hasAttribute('focusgroup'))
      tablist.setAttribute('focusgroup', 'tablist inline')
    for (const pair of this.list) roles(pair)
    this.select(this.initial())
    new FocusGroup(tablist, readSpec(tablist), signal)
    signal.addEventListener('abort', () => this.restore(), { once: true })
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

  private select(at: number): void {
    this.list.forEach(({ tab, panel }, i) => {
      tab.setAttribute('aria-selected', String(i === at))
      panel.hidden = i !== at
    })
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

  /** Disconnected: back to layer 0, every section shown. */
  private restore(): void {
    for (const { panel } of this.list) panel.hidden = false
  }
}

/** Each link to a section inside the panel, with that section. */
function pairsIn(el: HTMLElement): Tab[] {
  const links = [...el.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')]
  return links.flatMap((tab) => {
    const panel = el.querySelector<HTMLElement>(
      `[id="${CSS.escape(tab.hash.slice(1))}"]`,
    )
    return panel ? [{ tab, panel }] : []
  })
}

/** The links' list (`ul`, `ol`, `nav`), else their parent; list items become presentation. */
function listOf(list: Tab[], el: HTMLElement): HTMLElement {
  const first = list[0]?.tab
  if (!first)
    throw new Error(
      'tabs: no links to sections inside this panel (<a href="#id"> → <section id>)',
    )
  const tablist =
    first.closest<HTMLElement>('ul, ol, nav') ?? first.parentElement ?? el
  for (const item of tablist.querySelectorAll(':scope > li'))
    item.setAttribute('role', 'presentation')
  return tablist
}

/** APG roles and the links between each tab and its panel. */
function roles({ tab, panel }: Tab): void {
  tab.id ||= `tab-${++made}`
  tab.setAttribute('role', 'tab')
  tab.setAttribute('aria-controls', panel.id)
  panel.setAttribute('role', 'tabpanel')
  panel.setAttribute('aria-labelledby', tab.id)
  if (!startsFocusable(panel)) panel.tabIndex = 0
}

/** APG: a panel gets tabindex=0 unless its first content is focusable. */
function startsFocusable(panel: HTMLElement): boolean {
  const first = panel.firstElementChild
  return (
    first !== null &&
    first.matches('a[href], button, input, select, textarea, [tabindex]')
  )
}
