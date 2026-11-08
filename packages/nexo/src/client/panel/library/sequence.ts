import { panel } from '../panel'
import { json, string } from '../params'
import { emit } from './hold'
import { Marks } from './marks'
import { animationsDone, atMost } from './motion'

/**
 * Sequence (Archive's phased sequence, e.g. a page turn: out → step → in).
 * When the `on` event reaches the element, `data-phase` takes each phase
 * in turn; CSS animates on it, and the next phase starts once the
 * element's animations finish (at most 4 s). Each phase is announced as
 * `sequence:phase` with `{ phase, waitUntil }`: hand `waitUntil` a promise
 * (the new page loading) and the sequence waits for it too, 4 s at most —
 * the same idea as bridge's `bridge:leave`. Ends with `sequence:done`; a
 * run in progress stops where it is when the panel ends.
 *
 *   <article data-panel="sequence" data-sequence-phases='["out","step","in"]'>
 *   article.dispatchEvent(new Event('sequence:start'))
 */
export const sequence = panel({
  params: {
    phases: json<string[]>(['out', 'in']),
    on: string('sequence:start'),
  },
  connect: (el, params, { signal }) =>
    new Sequence(el, params.phases, params.on, signal),
})

class Sequence {
  private readonly marks = new Marks()
  private running = false

  constructor(
    private readonly el: Element,
    private readonly phases: string[],
    on: string,
    private readonly signal: AbortSignal,
  ) {
    el.addEventListener(on, () => void this.run(), { signal })
    signal.addEventListener('abort', () => this.marks.restore(), { once: true })
  }

  private async run(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      for (const phase of this.phases) if (await this.enter(phase)) return
      this.marks.toggle(this.el, 'data-phase', false)
      emit(this.el, 'sequence:done')
    } finally {
      this.running = false
    }
  }

  /** One phase: announced, then waited for (animations and `waitUntil`, 4 s at most). Says whether the panel ended meanwhile. */
  private async enter(phase: string): Promise<boolean> {
    const waits: Promise<unknown>[] = []
    this.marks.set(this.el, 'data-phase', phase)
    const waitUntil = (p: Promise<unknown>) =>
      void waits.push(atMost(p.catch(reportError)))
    emit(this.el, 'sequence:phase', { phase, waitUntil })
    await Promise.all([animationsDone(this.el), ...waits])
    return this.signal.aborted
  }
}
