/** Shared by the effect panels: the visitor's motion preference, and waiting for animations. */

/** Live: read each time an effect starts (WAAPI and timers ignore CSS @media). */
export function reducedMotion(): boolean {
  return (
    globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  )
}

/** At most this long for an animation that never ends (C.15c's fallback). */
const AT_MOST = 4000

/** The element's animations (its subtree's too) finished, or none to wait for. */
export function animationsDone(el: Element): Promise<void> {
  const animations = el.getAnimations({ subtree: true })
  const finished = Promise.all(
    animations.map((a) => a.finished.catch(() => {})),
  )
  const atMost = new Promise((done) => setTimeout(done, AT_MOST))
  return Promise.race([finished, atMost]).then(() => {})
}

/**
 * Text effects keep the real text for assistive technology: a visually
 * hidden copy, and the animated one hidden from it. `restore` puts the
 * plain text back.
 */
export function speakingText(
  el: HTMLElement,
  text: string,
): { shown: HTMLElement; restore: () => void } {
  const spoken = document.createElement('span')
  spoken.textContent = text
  spoken.style.cssText =
    'position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap'
  const shown = document.createElement('span')
  shown.setAttribute('aria-hidden', 'true')
  el.replaceChildren(spoken, shown)
  return { shown, restore: () => (el.textContent = text) }
}
