import type { Scheduler } from './reactivity'

/**
 * How long a part of the tree lives (B.8): a signal, aborted with its
 * parent's. Each component and each region's content has its own.
 */
export class Life {
  private readonly controller = new AbortController()

  constructor(parent?: AbortSignal) {
    if (!parent) return
    if (parent.aborted) this.controller.abort(parent.reason)
    const end = () => this.controller.abort(parent.reason)
    parent.addEventListener('abort', end, { once: true, signal: this.signal })
  }

  get signal(): AbortSignal {
    return this.controller.signal
  }

  child(): Life {
    return new Life(this.signal)
  }

  end(): void {
    this.controller.abort()
  }
}

/**
 * The `inserted` phase (C.15b, C.17a): `mounted` and `ref` are effects on
 * this scheduler, so they wait until their nodes are in the document. They're
 * queued as the tree is built, children first, and run in that order.
 */
export class InsertedPhase implements Scheduler {
  private readonly waiting: (() => void)[] = []

  schedule(run: () => void): () => unknown {
    this.waiting.push(run)
    return () => this.drop(run)
  }

  /** The nodes are in the document: run what waited. */
  release(): void {
    for (const run of this.waiting.splice(0)) run()
  }

  private drop(run: () => void): void {
    const at = this.waiting.indexOf(run)
    if (at >= 0) this.waiting.splice(at, 1)
  }
}
