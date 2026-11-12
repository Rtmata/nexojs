import { panel } from '../panel'
import { boolean, string } from '../params'
import { Marks } from './marks'

/**
 * Accordion (WAI-ARIA APG Accordion) on native `<details>`: one
 * `<details>` per section, the same `name` for one open at a time
 * (Chrome 120, Safari 17.2, Firefox 130). Enter / Space, Tab and the
 * summary's button semantics are the platform's: APG asks nothing more.
 * Layer 0 needs no JS.
 *
 *   <div data-panel="accordion" data-accordion-remember>
 *     <details name="faq" id="controls"><summary>Controls</summary>…</details>
 *     <details name="faq" id="credits"><summary>Credits</summary>…</details>
 *   </div>
 *
 * The panel adds what GOV.UK's accordion has over `<details>`: `remember`
 * keeps the open sections for the session (`sessionStorage`, under the
 * panel's `id`, so each section needs one too), restored on the next
 * visit of the page. `accordion:toggle` carries `{ id, open }`.
 */
export const accordion = panel({
  params: { remember: boolean(), key: string('') },
  connect(el, { remember, key }, { signal }) {
    const sections = [
      ...el.querySelectorAll<HTMLDetailsElement>(':scope details'),
    ]
    if (remember) new Memory(storageKey(el, key), sections, signal, new Marks())
    el.addEventListener('toggle', (e) => announce(el, e), {
      capture: true,
      signal,
    })
  },
})

function announce(el: Element, event: Event): void {
  const details = event.target as HTMLDetailsElement
  if (details.parentElement?.closest('[data-panel~="accordion"]') !== el) return
  const detail = { id: details.id, open: details.open }
  el.dispatchEvent(
    new CustomEvent('accordion:toggle', { detail, bubbles: true }),
  )
}

function storageKey(el: Element, key: string): string {
  const own = key || el.id
  if (own) return `accordion:${own}`
  throw new Error(
    'panel: accordion: data-accordion-remember needs an id on the panel (or data-accordion-key)',
  )
}

/** The open sections, by id, kept for the session (GOV.UK `rememberExpanded`). */
class Memory {
  constructor(
    private readonly key: string,
    private readonly sections: HTMLDetailsElement[],
    signal: AbortSignal,
    private readonly marks: Marks,
  ) {
    this.restore()
    for (const details of sections)
      details.addEventListener('toggle', () => this.save(), { signal })
    signal.addEventListener('abort', () => marks.restore(), { once: true })
  }

  private restore(): void {
    const open = this.read()
    if (!open) return
    for (const details of this.sections)
      if (details.id)
        this.marks.toggle(details, 'open', open.includes(details.id))
  }

  private save(): void {
    const open = this.sections.filter((d) => d.open && d.id).map((d) => d.id)
    try {
      sessionStorage.setItem(this.key, JSON.stringify(open))
    } catch {
      /* storage refused (private mode, quota): the accordion still works */
    }
  }

  private read(): string[] | undefined {
    try {
      const text = sessionStorage.getItem(this.key)
      return text ? (JSON.parse(text) as string[]) : undefined
    } catch {
      return undefined
    }
  }
}
