import { inherited } from './attributes'
import { isPlainNavigation, plainClickOn } from './click'
import type { Loader } from './loader'
import { optionsOf } from './options'
import { parsed } from './origin'
import { swapperFor } from './swapper'
import { Watch } from './watch'

/**
 * Pages brought ahead of a click, by `data-bridge-prefetch`: `tap` (on
 * pointer down), `hover` (pointer over or focus), `viewport`, `eager`.
 * bridge links go into the response cache; links left to the browser get
 * Speculation Rules with the matching eagerness, where the browser has them.
 * Only a page a click would use is brought: another site, a download or
 * a link that opens elsewhere are the browser's, prefetched or not.
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

  /** A bridge link's page, asked for the way a click would: by segments, or whole. The loader decides whether it is worth bringing: not what it has, nor what is on its way, nor what it could not keep lately. */
  private bring(link: HTMLAnchorElement): void {
    if (!isPlainNavigation(plainClickOn(link))) return
    const swapper = swapperFor(optionsOf(link))
    const url = parsed(link.href, location.href)
    if (!swapper || !url) return
    void this.loader.prefetch(url, swapper.segments()).catch(() => {})
  }
}

/**
 * The browser's own prefetch for links bridge leaves to it, one rule set
 * per eagerness. Browsers read a rule set once, when its script enters the
 * document, so a changed set is a fresh script in place of the old one.
 * A new body is a new page: the sets start over with it, not with every
 * link the tab has seen.
 */
class SpeculationRules {
  private urls = this.empty()

  private empty() {
    return {
      conservative: new Set<string>(),
      moderate: new Set<string>(),
      eager: new Set<string>(),
    }
  }

  scan(root: ParentNode): void {
    if (root === document.body) this.urls = this.empty()
    const before = this.count()
    for (const link of root.querySelectorAll<HTMLAnchorElement>('a[href]')) {
      const eagerness = EAGERNESS[inherited(link, 'prefetch') ?? '']
      if (eagerness && optionsOf(link).target.kind === 'none')
        this.urls[eagerness].add(link.href)
    }
    if (this.count() !== before) this.write()
  }

  private count(): number {
    return Object.values(this.urls).reduce((n, urls) => n + urls.size, 0)
  }

  private write(): void {
    const script = document.createElement('script')
    script.type = 'speculationrules'
    script.setAttribute(OWNED, '')
    script.textContent = JSON.stringify({ prefetch: this.rules() })
    document.querySelector(`script[${OWNED}]`)?.remove()
    document.head.append(script)
  }

  private rules(): object[] {
    return Object.entries(this.urls)
      .filter(([, urls]) => urls.size)
      .map(([eagerness, urls]) => ({
        source: 'list',
        urls: [...urls],
        eagerness,
      }))
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
