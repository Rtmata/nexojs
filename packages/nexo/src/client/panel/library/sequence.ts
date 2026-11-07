import { panel } from '../panel'
import { json, string } from '../params'
import { emit } from './hold'
import { animationsDone } from './motion'

/**
 * Sequence (Archive's phased sequence, e.g. a page turn: out → step → in).
 * When the `on` event reaches the element, `data-phase` takes each phase
 * in turn; CSS animates on it, and the next phase starts once the
 * element's animations finish (at most 4 s). Each phase is announced as
 * `sequence:phase` with `{ phase, waitUntil }`: hand `waitUntil` a promise
 * (the new page loading) and the sequence waits for it too — the same
 * idea as bridge's `bridge:leave`. Ends with `sequence:done`.
 *
 *   <article data-panel="sequence" data-sequence-phases='["out","step","in"]'>
 *   article.dispatchEvent(new Event('sequence:start'))
 */
export const sequence = panel({
  params: {
    phases: json<string[]>(['out', 'in']),
    on: string('sequence:start'),
  },
  connect(el, { phases, on }, { signal }) {
    let running = false
    const run = async () => {
      if (running) return
      running = true
      for (const phase of phases) await enter(el, phase)
      el.removeAttribute('data-phase')
      running = false
      emit(el, 'sequence:done')
    }
    el.addEventListener(on, run, { signal })
  },
})

async function enter(el: Element, phase: string): Promise<void> {
  const waits: Promise<unknown>[] = []
  el.setAttribute('data-phase', phase)
  emit(el, 'sequence:phase', {
    phase,
    waitUntil: (p: Promise<unknown>) => void waits.push(p.catch(reportError)),
  })
  await Promise.all([animationsDone(el), ...waits])
}
