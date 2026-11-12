/**
 * Shared by the effect panels: waiting for animations — theater's pieces
 * underneath (panels wrap theater), so the rule is written once —
 * and speaking text.
 */
import { finished } from '../../theater/finished'
import { FIXED_WAIT } from '../../settle/settle'
import { hideVisually } from './visually-hidden'

/** At most this long for a promise that never ends (omino's fallback wait). */
export function atMost<T>(promise: Promise<T>): Promise<T | void> {
  let timer: ReturnType<typeof setTimeout>
  const cap = new Promise<void>(
    (done) => (timer = setTimeout(done, FIXED_WAIT)),
  )
  return Promise.race([promise, cap]).finally(() => clearTimeout(timer))
}

/** The element's animations (its subtree's too) finished, or none to wait for: theater's `finished`. */
export function animationsDone(el: Element): Promise<void> {
  return finished(el, { subtree: true })
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
  hideVisually(spoken)
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
