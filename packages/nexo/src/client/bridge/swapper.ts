import type { Loaded } from './loader'
import type { Options } from './options'
import { WholePage } from './page'
import { BySegments } from './segments'

/**
 * How a response goes into the page (pattern: strategy): by segments
 * (`BySegments`) or as the whole page (`WholePage`). `Navigation` runs the
 * same steps either way — announce, fetch, swap, record, scroll, announce
 * — and asks the strategy what to request, what is busy meanwhile, how
 * the swap is done and where a response that can't be swapped lands.
 */
export interface Swapper {
  /** What history and the requests in flight know the navigation by: segment names, or `_top`. */
  readonly targets: string[]
  /** The segments to ask the server for; none means the whole page. */
  segments(): string[]
  /** The elements that carry `aria-busy` while the request runs. */
  busy(): Element[]
  /** The swap, ready to run; throws when the response has nothing to swap. */
  prepare(loaded: Loaded): Prepared
  /** Where a response that couldn't be swapped lands: another strategy, or null for the browser. */
  landing(): Swapper | null
}

/** The strategy a link or form's options ask for; null when the browser keeps it (`_none`). */
export function swapperFor(options: Options): Swapper | null {
  const { target } = options
  if (target.kind === 'segments') return new BySegments(target.names, options)
  return target.kind === 'top' ? new WholePage() : null
}

export interface Prepared {
  /** The page must come the browser's way instead: a tracked asset changed since this page loaded. */
  outdated: boolean
  /** Waited for before the swap: the stylesheets a new page brings. Aborted, whatever it placed goes out again. */
  ready(signal: AbortSignal): Promise<void>
  /** Before the swap: `bridge:leave` on what will go, its exits awaited (C.19b); `live` also marks and awaits CSS exits (E.4). */
  leave(live: boolean): Promise<void>
  /** The leave was for nothing (the navigation was cancelled): what was marked comes back. */
  stay(): void
  /** The swap itself; the elements that are new afterwards. */
  apply(): Element[]
}
