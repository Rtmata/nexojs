import { BrowserFallback } from './fallback'
import type { Wanted as Full } from './loader'
import { Navigation, type Outcome, type Session } from './navigation'
import { optionsFrom, type VisitOptions } from './options'
import { swapperFor, type Swapper } from './swapper'

/**
 * bridge from a script, with the attributes' own words (see
 * `VisitOptions`): what a link or form does, asked for by hand. The page
 * gets these as exports of the script it already loads:
 *
 *   import { visit, reload, prefetch } from '/_nexo/bridge.js'
 *   await visit('/es/arcade/anio/1985', { target: 'shelves', history: 'push' })
 *
 * An import map lets the page write the package name instead, the one
 * TypeScript knows the types by:
 *
 *   <script type="importmap">
 *     { "imports": { "@nexoamigos/nexo/bridge/client": "/_nexo/bridge.js" } }
 *   </script>
 */
export class Api {
  constructor(private readonly session: Session) {}

  /** The page at `url` (relative to this one) swapped in; resolves once it is, rejects when bridge stopped or left the page to the browser. */
  async visit(url: string | URL, options: VisitOptions = {}): Promise<void> {
    const from = options.from ?? document.body
    const wanted = { url: new URL(url, location.href), method: 'GET' }
    ended(await this.navigation(from, wanted, options).run(), wanted.url)
  }

  private navigation(from: Element, wanted: Wanted, options: VisitOptions) {
    const read = optionsFrom(options, from)
    const fallback = new BrowserFallback(from, wanted)
    const swapper = this.swapper(read)
    return new Navigation(from, wanted, swapper, read, this.session, fallback)
  }

  /** This page again, those segments only: a counter after a change elsewhere. */
  reload(
    target: string | readonly string[],
    options: VisitOptions = {},
  ): Promise<void> {
    const here = new URL(location.href)
    here.hash = ''
    return this.visit(here, { ...options, target })
  }

  /** The page brought into the cache ahead of a visit, the way a `data-bridge-prefetch` link would. */
  prefetch(url: string | URL, options: VisitOptions = {}): Promise<void> {
    const read = optionsFrom(options, options.from ?? document.body)
    const segments = this.swapper(read).segments()
    return this.session.loader.prefetch(new URL(url, location.href), segments)
  }

  private swapper(read: ReturnType<typeof optionsFrom>): Swapper {
    const swapper = swapperFor(read)
    if (swapper) return swapper
    throw new Error(
      "bridge: a visit needs a target: segment names or '_top', not '_none'",
    )
  }
}

type Wanted = Omit<Full, 'segments'>

function ended(outcome: Outcome, url: URL): void {
  if (outcome === 'swapped') return
  throw new Error(`bridge: the visit to ${url} was ${outcome}`)
}
