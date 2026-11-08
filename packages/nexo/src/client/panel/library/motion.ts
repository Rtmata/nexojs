/** Shared by the effect panels: the visitor's motion preference, and waiting for animations. */

/** Live: read each time an effect starts (WAAPI and timers ignore CSS @media). */
export function reducedMotion(): boolean {
  return (
    globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  )
}

/** At most this long for an animation (or a promise) that never ends (C.15c's fallback). */
const AT_MOST = 4000

export function atMost<T>(promise: Promise<T>): Promise<T | void> {
  const cap = new Promise<void>((done) => setTimeout(done, AT_MOST))
  return Promise.race([promise, cap])
}

/** The element's animations (its subtree's too) finished, or none to wait for. */
export function animationsDone(el: Element): Promise<void> {
  const animations = el.getAnimations({ subtree: true })
  const finished = Promise.all(
    animations.map((a) => a.finished.catch(() => {})),
  )
  return atMost(finished).then(() => {})
}

/**
 * Text effects keep the real content for assistive technology: the
 * element's own nodes move into a visually hidden span (links and
 * emphasis included), and the animated text goes in one hidden from it.
 * `restore` puts the original nodes back, once.
 */
export function speakingText(el: HTMLElement): {
  text: string
  shown: HTMLElement
  restore: () => void
} {
  const original = [...el.childNodes]
  const text = el.textContent ?? ''
  const shown = document.createElement('span')
  shown.setAttribute('aria-hidden', 'true')
  el.replaceChildren(spokenCopy(original), shown)
  return { text, shown, restore: once(() => el.replaceChildren(...original)) }
}

/** The original nodes, moved into a visually hidden span: read, not seen. */
function spokenCopy(nodes: ChildNode[]): HTMLElement {
  const spoken = document.createElement('span')
  spoken.style.cssText =
    'position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap'
  spoken.append(...nodes)
  return spoken
}

function once(fn: () => void): () => void {
  let done = false
  return () => done || ((done = true), fn())
}

/** The user-perceived characters of a text (graphemes), so no emoji is split while it types. */
export function graphemes(text: string): string[] {
  const Segmenter = (
    Intl as {
      Segmenter?: new () => {
        segment(s: string): Iterable<{ segment: string }>
      }
    }
  ).Segmenter
  if (!Segmenter) return [...text]
  return [...new Segmenter().segment(text)].map((s) => s.segment)
}
