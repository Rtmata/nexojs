import { isHole, readerOf, type Reactivity, type Scheduler } from './reactivity'

/** Before the first run: nothing was written yet. */
const UNWRITTEN = Symbol('unwritten')

/**
 * Binds holes to their places. A fixed value is written once. A hole
 * is an effect whose first run is now, while its node is made, and whose
 * later runs go on connector's default scheduler. It lives on the
 * place's signal.
 */
export class Holes {
  constructor(private readonly reactivity: Reactivity) {}

  write(
    value: unknown,
    write: (value: unknown) => void,
    signal: AbortSignal,
  ): void {
    if (isHole(value)) this.bind(readerOf(value), write, signal)
    else write(value)
  }

  private bind(
    read: () => unknown,
    write: (value: unknown) => void,
    signal: AbortSignal,
  ): void {
    const { effect, untrack, microtask } = this.reactivity
    let last: unknown = UNWRITTEN
    const body = () => {
      const now = read()
      if (Object.is(now, last)) return
      last = now
      untrack(() => write(now))
    }
    effect(body, { signal, scheduler: new FirstNow(microtask) })
  }
}

/**
 * Runs the first time it's asked, right away; every later time, as `later`
 * does. Its loop limit is `later`'s.
 */
class FirstNow implements Scheduler {
  private first = true

  constructor(private readonly later: Scheduler) {}

  get limit(): number | undefined {
    return this.later.limit
  }

  schedule(run: () => void): () => unknown {
    if (!this.first) return this.later.schedule(run)
    this.first = false
    run()
    return () => {}
  }

  exhausted(): boolean {
    return this.later.exhausted?.() ?? false
  }
}
