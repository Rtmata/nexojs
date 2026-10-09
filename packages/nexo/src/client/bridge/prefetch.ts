import { inherited } from './attributes'
import type { Loader } from './loader'
import { optionsOf } from './options'
import { twinNames } from './swaps'
import { Watch } from './watch'

/**
 * Pages brought ahead of a click, by `data-bridge-prefetch`: `tap` (on
 * pointer down), `hover` (pointer over or focus), `viewport`, `eager`.
 * bridge links go into the response cache; links left to the browser get
 * Speculation Rules with the matching eagerness, where the browser has them.
 */
export class Prefetch {
  private readonly watch = new Watch('a[href]', 'prefetch', (link) =>
    this.bring(link as HTMLAnchorElement),
  )
  private readonly rules = new SpeculationRules()

  constructor(private readonly loader: Loader) {
    document.addEventListener('pointerdown', (e) => this.on(e, 'tap'), true)
    document.addEventListener('pointerover', (e) => this.on(e, 'hover'), true)
    document.addEventListener('focusin', (e) => this.on(e, 'hover'), true)
  }

  scan(root: ParentNode): void {
    this.watch.scan(root)
    this.rules.scan(root)
  }

  private on(event: Event, when: 'tap' | 'hover'): void {
    const link = (event.target as Element | null)?.closest('a[href]')
    if (
      link instanceof HTMLAnchorElement &&
      inherited(link, 'prefetch') === when
    )
      this.bring(link)
  }

  /** A bridge link's page, with the segments a click would ask for. */
  private bring(link: HTMLAnchorElement): void {
    const { target } = optionsOf(link)
    if (target.kind !== 'segments') return
    const segments = [...new Set([...target.names, ...twinNames()])]
    void this.loader.prefetch(new URL(link.href), segments).catch(() => {})
  }
}

/** The browser's own prefetch for links bridge leaves to it, one rule set per eagerness. */
class SpeculationRules {
  private readonly urls = {
    conservative: new Set<string>(),
    moderate: new Set<string>(),
    eager: new Set<string>(),
  }

  scan(root: ParentNode): void {
    let changed = false
    for (const link of root.querySelectorAll<HTMLAnchorElement>('a[href]')) {
      const eagerness = EAGERNESS[inherited(link, 'prefetch') ?? '']
      if (!eagerness || optionsOf(link).target.kind !== 'none') continue
      changed = this.urls[eagerness].add(link.href).size > 0 || changed
    }
    if (changed) this.write()
  }

  private write(): void {
    const prefetch = Object.entries(this.urls)
      .filter(([, urls]) => urls.size)
      .map(([eagerness, urls]) => ({
        source: 'list',
        urls: [...urls],
        eagerness,
      }))
    const script = this.script()
    script.textContent = JSON.stringify({ prefetch })
  }

  private script(): HTMLScriptElement {
    const found = document.querySelector<HTMLScriptElement>(`script[${OWNED}]`)
    if (found) return found
    const script = document.createElement('script')
    script.type = 'speculationrules'
    script.setAttribute(OWNED, '')
    return document.head.appendChild(script)
  }
}

const OWNED = 'data-bridge-rules'

const EAGERNESS: Record<
  string,
  'conservative' | 'moderate' | 'eager' | undefined
> = {
  tap: 'conservative',
  hover: 'moderate',
  viewport: 'eager',
  eager: 'eager',
}
