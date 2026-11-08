/** An element's own `enter` / `exit` (C.15c, item 36): awaited instead of its CSS. */
export type MotionFn = (
  el: Element,
  run: { signal: AbortSignal; reducedMotion: boolean },
) => unknown

/** A JS motion or an infinite animation: how long to wait at most (Angular's 4 s). */
const FIXED_WAIT = 4000
/** Over the longest finite CSS animation. */
const MARGIN = 500

const MOTION_STATE = { enter: 'data-entering', exit: 'data-exiting' } as const

type Kind = keyof typeof MOTION_STATE

/**
 * How elements come and go (C.15c). Leaving: marked `data-exiting`, made
 * `inert`, focus moved out, then its `exit` or its CSS animations are
 * awaited, at most a fallback time. Entering: the mirror, with
 * `data-entering`. Nexo never skips them by itself: `reducedMotion` is
 * passed, CSS has `@media`.
 */
export class Motions {
  private readonly own = {
    enter: new WeakMap<Element, MotionFn>(),
    exit: new WeakMap<Element, MotionFn>(),
  }
  private readonly timeouts = new WeakMap<Element, number>()

  /** Nexo's own props `enter`, `exit`, `exit-timeout`, from the element's props. */
  set(el: Element, name: string, value: unknown): void {
    if (value == null) return // not given
    if (name === 'exit-timeout') this.timeouts.set(el, timeoutOf(el, value))
    else if (typeof value === 'function')
      this.own[name as Kind].set(el, value as MotionFn)
    else
      throw new Error(
        `omino: <${el.localName} ${name}> takes a function: (el, { signal, reducedMotion }) => Promise`,
      )
  }

  /** Nothing to wait for: `undefined`, so the caller goes on right away. */
  leave(nodes: Node[], signal: AbortSignal): Promise<void> | undefined {
    const els = elementsOf(nodes)
    for (const el of els) markLeaving(el)
    return this.await(els, 'exit', signal)
  }

  enter(nodes: Node[], signal: AbortSignal): Promise<void> | undefined {
    const els = elementsOf(nodes)
    for (const el of els) el.setAttribute(MOTION_STATE.enter, '')
    const done = () =>
      els.forEach((el) => el.removeAttribute(MOTION_STATE.enter))
    const waiting = this.await(els, 'enter', signal)
    if (!waiting) return void done()
    return waiting.then(done)
  }

  private await(
    els: Element[],
    kind: Kind,
    signal: AbortSignal,
  ): Promise<void> | undefined {
    const waits = els
      .map((el) => this.waitFor(el, kind, signal))
      .filter((w) => w !== undefined)
    if (waits.length === 0) return undefined
    return Promise.all(waits).then(() => {})
  }

  private waitFor(
    el: Element,
    kind: Kind,
    signal: AbortSignal,
  ): Promise<unknown> | undefined {
    const fn = this.own[kind].get(el)
    if (fn) return this.atMost(el, FIXED_WAIT, this.run(fn, el, signal))
    const animations = el.getAnimations({ subtree: true })
    if (animations.length === 0) return undefined
    return this.atMost(el, fallbackFor(animations), finished(animations))
  }

  /** The author's motion as a promise: a synchronous throw rejects, like an async one. */
  private run(
    fn: MotionFn,
    el: Element,
    signal: AbortSignal,
  ): Promise<unknown> {
    return new Promise((done) =>
      done(fn(el, { signal, reducedMotion: reducedMotion() })),
    )
  }

  /** A motion that never finishes still ends: at `exit-timeout`, or the fallback. */
  private atMost(
    el: Element,
    fallback: number,
    work: Promise<unknown>,
  ): Promise<unknown> {
    const ms = this.timeouts.get(el) ?? fallback
    const timeout = new Promise((done) => setTimeout(done, ms))
    return Promise.race([work.catch(reportError), timeout])
  }
}

function elementsOf(nodes: Node[]): Element[] {
  return nodes.filter(
    (node): node is Element => node.nodeType === Node.ELEMENT_NODE,
  )
}

function markLeaving(el: Element): void {
  el.setAttribute(MOTION_STATE.exit, '')
  if ('inert' in el) (el as HTMLElement).inert = true
  if (el.contains(document.activeElement))
    (document.activeElement as HTMLElement).blur()
}

/** A cancelled animation counts as finished. */
function finished(animations: Animation[]): Promise<unknown> {
  return Promise.all(animations.map((a) => a.finished.catch(() => {})))
}

/** The longest finite animation left, plus a margin; infinite ones get the fixed wait. */
function fallbackFor(animations: Animation[]): number {
  let longest = 0
  for (const animation of animations) {
    const end = Number(animation.effect?.getComputedTiming().endTime ?? 0)
    if (!Number.isFinite(end)) return FIXED_WAIT
    longest = Math.max(longest, end - Number(animation.currentTime ?? 0))
  }
  return Math.min(longest + MARGIN, FIXED_WAIT) // a 30 s decoration never holds the next page 30 s
}

/** Live: read when each motion starts. */
function reducedMotion(): boolean {
  return (
    globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  )
}

/** `exit-timeout` in ms: a non-negative number, else an error (NaN would be "no wait at all"). */
function timeoutOf(el: Element, value: unknown): number {
  const ms = typeof value === 'string' ? Number(value) : value
  if (typeof ms === 'number' && Number.isFinite(ms) && ms >= 0) return ms
  throw new Error(
    `omino: <${el.localName} exit-timeout=${JSON.stringify(value)}> takes milliseconds, a number`,
  )
}
