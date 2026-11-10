import { segmentIn } from './attributes'
import type { Loaded } from './loader'
import type { Options } from './options'
import { WholePage } from './page'
import {
  adoptStyles,
  apply,
  errorSwap,
  Leave,
  leavingOf,
  pairAll,
  twinNames,
  type Swap,
} from './swaps'
import type { Prepared, Swapper } from './swapper'

/**
 * The response goes in by segments: the targets, plus the twins. A
 * response without the segments is read by its status: an error page
 * (≥ 400) stays in context, its `<main>` goes into the target (or the
 * `data-bridge-fail` segment); a successful page means the server took
 * the visitor elsewhere (a redirect after a form), so it lands as the
 * whole page, with its URL.
 */
export class BySegments implements Swapper {
  constructor(
    readonly targets: string[],
    private readonly options: Options,
  ) {}

  /** Twins ride along in the request, so one response refreshes them too. */
  segments(): string[] {
    return [...new Set([...this.targets, ...twinNames()])]
  }

  /** The targets, plus the segment named by `data-bridge-busy`. */
  busy(): Element[] {
    const { busy } = this.options
    const names = busy ? [...this.targets, busy] : this.targets
    return names
      .map((name) => segmentIn(document, name))
      .filter((element): element is Element => element !== null)
  }

  /** A fragment brings no head to compare, so it is never outdated. */
  prepare(loaded: Loaded): Prepared {
    const swaps = this.swapsFor(loaded)
    const leaving = () => leavingOf(swaps)
    const leave = new Leave()
    return {
      outdated: false,
      ready: async () => {},
      leave: (live) => leave.run(leaving(), live),
      stay: () => leave.stay(),
      apply: () => (adoptStyles(loaded.page), apply(swaps)),
    }
  }

  /** What goes where: the targets, or the failure segment for an error. */
  private swapsFor(loaded: Loaded): Swap[] {
    return loaded.status < 400
      ? pairAll(this.targets, loaded.page, this.options.swap)
      : this.errorSwaps(loaded.page)
  }

  landing(): Swapper {
    return new WholePage()
  }

  private errorSwaps(page: Document): Swap[] {
    const into = this.options.fail ? [this.options.fail] : this.targets
    return into.map((name) => errorSwap(name, page))
  }
}
