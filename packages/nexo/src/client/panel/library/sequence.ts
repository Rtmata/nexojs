import { panel } from '../panel'
import { json, string } from '../params'
import { emit } from './hold'
import { Marks } from './marks'
import { bridgeCommands } from './commands'
import { animationsDone, atMost } from './motion'

/**
 * Sequence (Archive's phased sequence, e.g. a page turn: out → step → in).
 * When its command arrives (the platform's Invoker Commands: a button with
 * `command="--start"`, the name in `data-sequence-command`) — or the event
 * named in `data-sequence-on` — `data-phase` takes each phase
 * in turn; CSS animates on it, and the next phase starts once the
 * element's animations finish (at most 4 s). Each phase is announced as
 * `sequence:phase` with `{ phase, waitUntil }`: hand `waitUntil` a promise
 * (the new page loading) and the sequence waits for it too, 4 s at most —
 * the same idea as bridge's `bridge:leave`. Ends with `sequence:done`; a
 * run in progress stops where it is when the panel ends.
 *
 *   <article id="page" data-panel="sequence" data-sequence-phases='["out","step","in"]'>
 *   <button command="--start" commandfor="page">Next page</button>
 */
export const sequence = panel({
  params: {
    phases: json<string[]>(['out', 'in'], 'array'),
    command: string('--start'),
    on: string(''),
  },
  connect(el, params, { signal }) {
    bridgeCommands(el as HTMLElement, signal) // where the platform lacks commands (WebKitGTK 2.50)
    new Sequence(el, params, signal)
  },
})

class Sequence {
  private readonly marks = new Marks()
  private readonly phases: string[]
  private running = false

  constructor(
    private readonly el: Element,
    { phases, command, on }: { phases: string[]; command: string; on: string },
    private readonly signal: AbortSignal,
  ) {
    this.phases = phases
    const commanded = (e: Event) =>
      (e as Event & { command?: string }).command === command && void this.run()
    el.addEventListener('command', commanded, { signal })
    if (on) el.addEventListener(on, () => void this.run(), { signal })
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
